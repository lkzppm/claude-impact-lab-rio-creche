/**
 * Fluxo de escalonamento da convocação — comparecimento presencial para confirmar a vaga.
 *
 * Especificação em código do que um job diário de backend faria (funções de efeito são `TODO`
 * com `console.info`). `CrecheNovosAlunosPage` só lê o resultado (`prazoDiasRestantes`,
 * `confirmacaoVisita`, `ligacaoTentada`, `status`) que já vem pronto no mock.
 *
 * Cronograma (contado a partir da convocação, prazo total de `PRAZO_COMPARECIMENTO_DIAS` = 3
 * dias úteis para o responsável ir à unidade confirmar a vaga presencialmente):
 *
 *   dia 1  → perguntarConfirmacaoVisita()
 *       Mensageria pergunta ao responsável se ele vai à visita (ver
 *       `spec/creche/mensageria.md`, `convocacao_confirmacao_visita`). Resposta fica em
 *       `confirmacaoVisita` ("sim" | "nao" | null enquanto não responde).
 *
 *   dia 2  → perguntarConfirmacaoVisita() de novo, SE ainda não respondeu
 *       + ligarParaContatoPrincipal() SE ainda não respondeu no fim do dia 2
 *       A escola tenta ligar para o contato principal (não é mensagem automática — é uma tarefa
 *       manual que aparece na "Central de mensageria" da unidade).
 *
 *   dia 3 (fim do prazo) → perderVagaPorNaoComparecimento(), SE o responsável não confirmou presença
 *       O responsável perde a vaga NESTA escola e sai da fila dela. A criança aparece na galeria
 *       "Perderam a vaga" por `JANELA_EXIBICAO_PERDA_VAGA_DIAS` dias e depois some da lista.
 *       Isso dispara o reparelhamento (ver abaixo) — perder a vaga em uma escola não é o fim da
 *       inscrição da família.
 *
 * Reparelhamento após perda de vaga por não comparecimento:
 *   1. iniciarReparelhamento() — a família é pareada com uma nova escola (mesma régua de
 *      classificação) e recebe uma mensagem perguntando se ainda tem interesse em vaga na rede
 *      (`spec/creche/mensageria.md`, `reparelhamento_interesse`).
 *   2. Se responder "sim" dentro de `PRAZO_RESPOSTA_REPARELHAMENTO_DIAS` (2 dias) em QUALQUER um
 *      dos até 3 contatos obrigatórios da família → confirmarReparelhamento(): a criança volta a
 *      ser convocada, agora na nova escola, reiniciando este mesmo cronograma de comparecimento.
 *   3. Se NINGUÉM dos 3 contatos responder dentro do prazo → encerrarInscricaoPorFaltaDeResposta():
 *      a inscrição da família é encerrada — não há novo pareamento.
 */

import { enviarMensagem } from "../api/client";
import { UNIDADE_EXEMPLO } from "./mock";
import { telefoneParaWhatsapp } from "./telefone";

export type ConfirmacaoVisita = "sim" | "nao" | null;

interface AlunoParaAviso {
  id: string;
  nome: string;
  contatoPrincipal: { nome: string; telefone: string };
  prazoLimite?: string;
}

/** dia em que a mensageria pergunta pela primeira vez se o responsável vai à visita */
export const PRAZO_1A_PERGUNTA_VISITA_DIAS = 1;
/** dia em que a mensageria repete a pergunta e a escola tenta ligar, se ainda sem resposta */
export const PRAZO_2A_PERGUNTA_E_LIGACAO_DIAS = 2;
/** dia (fim do prazo) em que a criança perde a vaga por não comparecimento */
export const PRAZO_PERDA_VAGA_DIAS = 3;
/** quantos dias o card de "perdeu a vaga" fica visível na galeria antes de sumir da lista */
export const JANELA_EXIBICAO_PERDA_VAGA_DIAS = 3;

/** prazo, em dias, para responder ao convite de reparelhamento em algum dos 3 contatos obrigatórios */
export const PRAZO_RESPOSTA_REPARELHAMENTO_DIAS = 2;
/** número de contatos obrigatórios tentados antes de encerrar a inscrição por falta de resposta */
export const CONTATOS_OBRIGATORIOS_REPARELHAMENTO = 3;

/**
 * Dia 1 e dia 2 (se ainda sem resposta) — pergunta se o responsável vai à visita. Envio real via
 * `POST /mensagens/enviar` (`backend/app/routers/mensagens.py`); idempotência por dia fica com
 * `chave_idem` derivada de aluno+dia — reenviar no mesmo dia não gera segunda mensagem.
 */
export async function perguntarConfirmacaoVisita(aluno: AlunoParaAviso, dia: number) {
  const destino = telefoneParaWhatsapp(aluno.contatoPrincipal.telefone);
  if (!destino) return;
  return enviarMensagem({
    canal: "whatsapp",
    destino,
    template: "convocacao_confirmacao_visita",
    dados: { responsavel: aluno.contatoPrincipal.nome, crianca: aluno.nome, unidade: UNIDADE_EXEMPLO.nome, prazo: aluno.prazoLimite ?? "" },
    referencia: `convocacao-confirmacao:${aluno.id}`,
    chave_idem: `convocacao-confirmacao:${aluno.id}:dia${dia}`,
    ator: "painel-creche",
  });
}

/** Fim do dia 2, sem resposta ainda — tarefa manual para a escola ligar para o contato principal. */
export function ligarParaContatoPrincipal(alunoId: string) {
  // TODO: não existe "central de tarefas" no backend hoje — a ligação continua sendo controlada só
  // pelo campo `ligacaoTentada` do mock. Quando existir, isto vira POST numa fila de tarefas da unidade.
  console.info("ligarParaContatoPrincipal", alunoId);
}

/**
 * Fim do dia 3 (prazo total), sem confirmação de presença — perde a vaga nesta escola. Avisa a
 * família (`convocacao_perda_vaga`) e encadeia `iniciarReparelhamento`.
 */
export async function perderVagaPorNaoComparecimento(aluno: AlunoParaAviso) {
  const destino = telefoneParaWhatsapp(aluno.contatoPrincipal.telefone);
  if (destino) {
    await enviarMensagem({
      canal: "whatsapp",
      destino,
      template: "convocacao_perda_vaga",
      dados: { responsavel: aluno.contatoPrincipal.nome, crianca: aluno.nome, unidade: UNIDADE_EXEMPLO.nome },
      referencia: `convocacao-perda-vaga:${aluno.id}`,
      ator: "painel-creche",
    });
  }
  await iniciarReparelhamento(aluno, "a próxima unidade compatível");
}

/** Orquestra as etapas do cronograma de comparecimento conforme os dias decorridos desde a convocação. */
export async function escalonarConvocacao(aluno: AlunoParaAviso & {
  diasDesdeConvocacao: number;
  confirmacaoVisita: ConfirmacaoVisita;
}) {
  const { diasDesdeConvocacao, confirmacaoVisita } = aluno;
  if (confirmacaoVisita === "sim") return; // já confirmou — nada a escalonar
  if (diasDesdeConvocacao === PRAZO_1A_PERGUNTA_VISITA_DIAS) await perguntarConfirmacaoVisita(aluno, diasDesdeConvocacao);
  if (diasDesdeConvocacao === PRAZO_2A_PERGUNTA_E_LIGACAO_DIAS) {
    await perguntarConfirmacaoVisita(aluno, diasDesdeConvocacao);
    ligarParaContatoPrincipal(aluno.id);
  }
  if (diasDesdeConvocacao >= PRAZO_PERDA_VAGA_DIAS) await perderVagaPorNaoComparecimento(aluno);
}

/** Passo 1 do reparelhamento — pareia com uma nova escola e pergunta se ainda há interesse. */
export async function iniciarReparelhamento(aluno: AlunoParaAviso, novaUnidadeNome: string) {
  // TODO: não existe endpoint de reparelhamento no backend — a nova unidade compatível precisaria
  // rodar de novo o motor de classificação (`app/engine/matching.py`) para esta criança. Por ora só
  // dispara o convite por mensagem; a escolha da unidade é um placeholder de texto.
  const destino = telefoneParaWhatsapp(aluno.contatoPrincipal.telefone);
  if (!destino) return;
  const prazo = new Date();
  prazo.setDate(prazo.getDate() + PRAZO_RESPOSTA_REPARELHAMENTO_DIAS);
  return enviarMensagem({
    canal: "whatsapp",
    destino,
    template: "reparelhamento_interesse",
    dados: {
      responsavel: aluno.contatoPrincipal.nome, crianca: aluno.nome, nova_unidade: novaUnidadeNome,
      prazo: prazo.toLocaleDateString("pt-BR"),
    },
    referencia: `reparelhamento:${aluno.id}`,
    ator: "painel-creche",
  });
}

/** Algum dos 3 contatos respondeu "sim" dentro do prazo — reconvoca na nova escola. */
export function confirmarReparelhamento(alunoId: string, novaUnidadeCodigo: string) {
  // TODO: PATCH /api/v1/novos-alunos/{alunoId} { status: "convocado", unidade_codigo: novaUnidadeCodigo }
  // reinicia o cronograma de comparecimento acima do zero, agora na nova unidade.
  console.info("confirmarReparelhamento", alunoId, novaUnidadeCodigo);
}

/** Nenhum dos 3 contatos respondeu dentro do prazo — encerra a inscrição, sem novo pareamento. */
export function encerrarInscricaoPorFaltaDeResposta(alunoId: string) {
  // TODO: PATCH /api/v1/novos-alunos/{alunoId} { status: "inscricao_encerrada" }
  console.info("encerrarInscricaoPorFaltaDeResposta", alunoId);
}

/** Verdadeiro enquanto o card de "perdeu a vaga" ainda deve aparecer na galeria de Novos Alunos. */
export function perdeuVagaHaMenosDe(
  aluno: { status: string; perdeuVagaEm?: string | null },
  dias = JANELA_EXIBICAO_PERDA_VAGA_DIAS,
): boolean {
  if (aluno.status !== "perdeu_vaga" || !aluno.perdeuVagaEm) return false;
  const limite = new Date(aluno.perdeuVagaEm);
  limite.setDate(limite.getDate() + dias);
  return new Date() <= limite;
}
