/**
 * Fluxo de escalonamento do atraso na verificação de documento.
 *
 * Este arquivo é a especificação em código do que um job diário de backend faria — aqui é só
 * estrutura e comentário (funções de efeito são `TODO` com `console.info`), a demo não roda o
 * relógio de verdade. `CrecheDocumentosPage` e `CrecheDashboardPage` só leem o resultado
 * (`diasAtraso`, `estagioAtraso`) que já vem pronto no mock.
 *
 * Contexto — quando não é possível verificar o documento online, a verificação é presencial, na
 * unidade da rede mais próxima do responsável:
 *   1. A família escolhe uma unidade para a verificação presencial (`escolherUnidadePresencial`).
 *   2. O responsável entra na fila de Verificação de Documentos DAQUELA unidade — mesma tela que já
 *      existe, com `origemVerificacao = "presencial"` e `unidadePresencial` preenchidos.
 *   3. A partir daí, o responsável segue o MESMO cronograma de atraso abaixo — não importa se a
 *      verificação é online ou presencial, o relógio é o mesmo.
 *
 * Cronograma de atraso (contado a partir do vencimento do prazo de verificação, hoje 1 dia —
 * `PRAZO_VERIFICACAO_DOCUMENTO_DIAS` em mock.ts):
 *
 *   dia 1 de atraso (1º dia útil)  → avisarAtraso()
 *       Dispara mensagem no container de mensageria avisando o responsável do atraso e do que
 *       acontece se ele continuar em atraso (ver modelo de mensagem abaixo).
 *
 *   dia 3 de atraso (1 + 2 dias)   → aplicarPerdaDeCriterios()
 *       "Tem irmão na rede" e "Está no programa Pequenos Cariocas" deixam de contar na pontuação
 *       da inscrição — como se a família não tivesse esses dois critérios.
 *
 *   dia 7 de atraso                → aplicarPerdaDeVaga()
 *       A criança perde a vaga. Fica visível na tela por `JANELA_EXIBICAO_PERDA_VAGA_DIAS` dias
 *       mostrando "perdeu a vaga" e depois some da lista (o job de limpeza é outro `TODO`).
 *
 * Cada etapa só dispara uma vez (idempotente por responsável + etapa) — um cron que rodasse esta
 * função todo dia não deveria reenviar o aviso nem reaplicar a perda de critérios.
 */

export type EstagioAtraso = "aviso_enviado" | "criterios_em_risco" | "vaga_perdida";

/** dia em que o aviso de atraso é enviado pela mensageria */
export const PRAZO_AVISO_ATRASO_DIAS = 1;
/** 1 (aviso) + 2 dias de tolerância = dia em que os critérios saem da pontuação */
export const PRAZO_PERDA_CRITERIOS_DIAS = 3;
/** dia em que a criança perde a vaga */
export const PRAZO_PERDA_VAGA_DIAS = 7;
/** quantos dias o card de "perdeu a vaga" fica visível antes de sumir da lista */
export const JANELA_EXIBICAO_PERDA_VAGA_DIAS = 7;

export const ESTAGIO_ATRASO_LABEL: Record<EstagioAtraso, string> = {
  aviso_enviado: "Aviso enviado",
  criterios_em_risco: "Critérios em risco",
  vaga_perdida: "Perdeu a vaga",
};

/** Em que ponto do cronograma um responsável está, a partir dos dias de atraso. `null` = ainda dentro do 1º dia. */
export function estagioAtraso(diasAtraso: number): EstagioAtraso | null {
  if (diasAtraso >= PRAZO_PERDA_VAGA_DIAS) return "vaga_perdida";
  if (diasAtraso >= PRAZO_PERDA_CRITERIOS_DIAS) return "criterios_em_risco";
  if (diasAtraso >= PRAZO_AVISO_ATRASO_DIAS) return "aviso_enviado";
  return null;
}

/** Etapa 1 do cronograma — dia 1 de atraso. */
function avisarAtraso(responsavelId: string) {
  // TODO: POST /api/v1/creche/mensageria/enviar { responsavel_id, template: "atraso_documento_dia1" }
  // modelo de mensagem (o container de mensageria preenche nome/criança):
  //   "Olá, {nome}. A verificação do documento de {crianca} está em atraso há 1 dia. Se passarem
  //    mais 2 dias sem verificar, {crianca} deixa de contar com os critérios "tem irmão na rede" e
  //    "Pequenos Cariocas" na pontuação. Procure a unidade para regularizar."
  // grava em `evento` (tipo = mensageria_enviada); idempotente por (responsavel_id, template).
  console.info("avisarAtraso", responsavelId);
}

/** Etapa 2 — dia 3 de atraso. */
function aplicarPerdaDeCriterios(responsavelId: string) {
  // TODO: PATCH /api/v1/responsaveis/{responsavelId} { criterios_perdidos: true }
  // a pontuação da inscrição passa a ignorar irmao_na_rede e pequenos_cariocas.
  console.info("aplicarPerdaDeCriterios", responsavelId);
}

/** Etapa 3 — dia 7 de atraso. */
function aplicarPerdaDeVaga(responsavelId: string) {
  // TODO: PATCH /api/v1/responsaveis/{responsavelId} { perdeu_vaga: true, perdeu_vaga_em: now }
  // + evento de perda de vaga; a vaga volta para a fila de classificação do Nível Central.
  console.info("aplicarPerdaDeVaga", responsavelId);
}

/**
 * Orquestra as três etapas conforme os dias de atraso — é isto que o job diário chamaria para
 * cada responsável com status "atrasado". Devolve o estágio aplicado (ou `null`).
 */
export function escalonarAtraso(responsavel: { id: string; diasAtraso: number }): EstagioAtraso | null {
  const estagio = estagioAtraso(responsavel.diasAtraso);
  if (estagio === "aviso_enviado") avisarAtraso(responsavel.id);
  if (estagio === "criterios_em_risco") aplicarPerdaDeCriterios(responsavel.id);
  if (estagio === "vaga_perdida") aplicarPerdaDeVaga(responsavel.id);
  return estagio;
}

/** Passo 1 do caminho presencial: a família escolhe a unidade mais próxima para verificar lá. */
export function escolherUnidadePresencial(responsavelId: string, unidadeCodigo: string) {
  // TODO: PATCH /api/v1/responsaveis/{responsavelId} { origem_verificacao: "presencial", unidade_presencial: unidadeCodigo }
  // a partir daqui o responsável entra na fila de Verificação de Documentos DAQUELA unidade, com o
  // mesmo cronograma de atraso acima (não é um fluxo separado).
  console.info("escolherUnidadePresencial", responsavelId, unidadeCodigo);
}

/** Verdadeiro enquanto o card de "perdeu a vaga" ainda deve aparecer na tela. */
export function perdeuVagaHaMenosDe(
  responsavel: { perdeuVaga?: boolean; perdeuVagaEm?: string | null },
  dias = JANELA_EXIBICAO_PERDA_VAGA_DIAS,
): boolean {
  if (!responsavel.perdeuVaga || !responsavel.perdeuVagaEm) return false;
  const limite = new Date(responsavel.perdeuVagaEm);
  limite.setDate(limite.getDate() + dias);
  return new Date() <= limite;
}
