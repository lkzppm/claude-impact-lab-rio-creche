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
 * `PRAZO_VERIFICACAO_DOCUMENTO_DIAS` em mock.ts). Este cronograma NÃO tira a vaga da criança — a
 * perda de vaga só acontece no cronograma de convocação (ver `fluxoConvocacao.ts`), quando o
 * responsável já convocado não comparece para confirmar presencialmente.
 *
 *   dia 1 de atraso (1º dia útil)  → avisarAtraso()
 *       Dispara mensagem no container de mensageria avisando o responsável do atraso e do que
 *       acontece se ele continuar em atraso (ver modelo de mensagem abaixo).
 *
 *   dia 3 de atraso (1 + 2 dias)   → aplicarPerdaDeCriterios()
 *       "Tem irmão na rede" e "Está no programa Pequenos Cariocas" deixam de contar na pontuação
 *       da inscrição — como se a família não tivesse esses dois critérios. Esta é a última etapa
 *       deste cronograma; a partir daqui o responsável continua "em atraso" indefinidamente até
 *       verificar (ou perder a vaga por outro motivo, no fluxo de convocação).
 *
 * Cada etapa só dispara uma vez (idempotente por responsável + etapa) — um cron que rodasse esta
 * função todo dia não deveria reenviar o aviso nem reaplicar a perda de critérios.
 */

export type EstagioAtraso = "aviso_enviado" | "criterios_em_risco";

/** dia em que o aviso de atraso é enviado pela mensageria */
export const PRAZO_AVISO_ATRASO_DIAS = 1;
/** 1 (aviso) + 2 dias de tolerância = dia em que os critérios saem da pontuação */
export const PRAZO_PERDA_CRITERIOS_DIAS = 3;

export const ESTAGIO_ATRASO_LABEL: Record<EstagioAtraso, string> = {
  aviso_enviado: "Aviso enviado",
  criterios_em_risco: "Critérios em risco",
};

/** Em que ponto do cronograma um responsável está, a partir dos dias de atraso. `null` = ainda dentro do 1º dia. */
export function estagioAtraso(diasAtraso: number): EstagioAtraso | null {
  if (diasAtraso >= PRAZO_PERDA_CRITERIOS_DIAS) return "criterios_em_risco";
  if (diasAtraso >= PRAZO_AVISO_ATRASO_DIAS) return "aviso_enviado";
  return null;
}

/** Etapa 1 do cronograma — dia 1 de atraso. Ver `spec/creche/mensageria.md` (`atraso_documento_dia1`). */
function avisarAtraso(responsavelId: string) {
  // TODO: POST /api/v1/creche/mensageria/enviar { responsavel_id, template: "atraso_documento_dia1" }
  // grava em `evento` (tipo = mensageria_enviada); idempotente por (responsavel_id, template).
  console.info("avisarAtraso", responsavelId);
}

/** Etapa 2 — dia 3 de atraso. Ver `spec/creche/mensageria.md` (`atraso_documento_dia3_perda_criterios`). */
function aplicarPerdaDeCriterios(responsavelId: string) {
  // TODO: PATCH /api/v1/responsaveis/{responsavelId} { criterios_perdidos: true }
  // a pontuação da inscrição passa a ignorar irmao_na_rede e pequenos_cariocas; dispara mensagem
  // avisando a família da perda dos critérios.
  console.info("aplicarPerdaDeCriterios", responsavelId);
}

/**
 * Orquestra as duas etapas conforme os dias de atraso — é isto que o job diário chamaria para
 * cada responsável com status "atrasado". Devolve o estágio aplicado (ou `null`).
 */
export function escalonarAtraso(responsavel: { id: string; diasAtraso: number }): EstagioAtraso | null {
  const estagio = estagioAtraso(responsavel.diasAtraso);
  if (estagio === "aviso_enviado") avisarAtraso(responsavel.id);
  if (estagio === "criterios_em_risco") aplicarPerdaDeCriterios(responsavel.id);
  return estagio;
}

/** Passo 1 do caminho presencial: a família escolhe a unidade mais próxima para verificar lá. */
export function escolherUnidadePresencial(responsavelId: string, unidadeCodigo: string) {
  // TODO: PATCH /api/v1/responsaveis/{responsavelId} { origem_verificacao: "presencial", unidade_presencial: unidadeCodigo }
  // a partir daqui o responsável entra na fila de Verificação de Documentos DAQUELA unidade, com o
  // mesmo cronograma de atraso acima (não é um fluxo separado).
  console.info("escolherUnidadePresencial", responsavelId, unidadeCodigo);
}
