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

export type ConfirmacaoVisita = "sim" | "nao" | null;

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

/** Dia 1 e dia 2 (se ainda sem resposta) — pergunta se o responsável vai à visita. */
function perguntarConfirmacaoVisita(alunoId: string) {
  // TODO: POST /api/v1/creche/mensageria/enviar { aluno_id: alunoId, template: "convocacao_confirmacao_visita" }
  // idempotente por dia — não reenvia no mesmo dia; só repete no dia 2 se `confirmacaoVisita` ainda for null.
  console.info("perguntarConfirmacaoVisita", alunoId);
}

/** Fim do dia 2, sem resposta ainda — tarefa manual para a escola ligar para o contato principal. */
function ligarParaContatoPrincipal(alunoId: string) {
  // TODO: cria tarefa na "Central de mensageria" da unidade (não é mensagem automática).
  console.info("ligarParaContatoPrincipal", alunoId);
}

/** Fim do dia 3 (prazo total), sem confirmação de presença — perde a vaga nesta escola. */
function perderVagaPorNaoComparecimento(alunoId: string) {
  // TODO: PATCH /api/v1/novos-alunos/{alunoId} { status: "perdeu_vaga", perdeu_vaga_em: now }
  // dispara `iniciarReparelhamento(alunoId)` e mensagem avisando a família da perda da vaga
  // (`spec/creche/mensageria.md`, `convocacao_perda_vaga`).
  console.info("perderVagaPorNaoComparecimento", alunoId);
}

/** Orquestra as etapas do cronograma de comparecimento conforme os dias decorridos desde a convocação. */
export function escalonarConvocacao(aluno: {
  id: string;
  diasDesdeConvocacao: number;
  confirmacaoVisita: ConfirmacaoVisita;
}) {
  const { id, diasDesdeConvocacao, confirmacaoVisita } = aluno;
  if (confirmacaoVisita === "sim") return; // já confirmou — nada a escalonar
  if (diasDesdeConvocacao === PRAZO_1A_PERGUNTA_VISITA_DIAS) perguntarConfirmacaoVisita(id);
  if (diasDesdeConvocacao === PRAZO_2A_PERGUNTA_E_LIGACAO_DIAS) {
    perguntarConfirmacaoVisita(id);
    ligarParaContatoPrincipal(id);
  }
  if (diasDesdeConvocacao >= PRAZO_PERDA_VAGA_DIAS) perderVagaPorNaoComparecimento(id);
}

/** Passo 1 do reparelhamento — pareia com uma nova escola e pergunta se ainda há interesse. */
export function iniciarReparelhamento(alunoId: string) {
  // TODO: POST /api/v1/creche/reparelhamento { aluno_id: alunoId } — roda a mesma régua de
  // classificação para achar a próxima escola compatível; envia `reparelhamento_interesse` para
  // os até 3 contatos obrigatórios da família.
  console.info("iniciarReparelhamento", alunoId);
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
