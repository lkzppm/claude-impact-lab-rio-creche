export type ResultadoContato = "nao_atendeu" | "aceitou_visita" | "recusou";

export const RESULTADO_CONTATO_LABEL: Record<ResultadoContato, string> = {
  nao_atendeu: "Não atendeu",
  aceitou_visita: "Aceitou visita",
  recusou: "Recusou",
};

/**
 * Situação mostrada na "central de mensageria" da unidade.
 *
 * Hoje o resultado é lançado à mão pelo servidor (botões da tabela). A ideia é que isso vire um
 * container de mensageria (WhatsApp, como já existe no ecossistema — spec/05) que liga
 * automaticamente pela pipeline e já classifica a resposta da família como "vai à visita",
 * "não respondeu" ou "recusou" antes mesmo de alguém desta tela precisar ligar. Esta tela passaria
 * a só refletir esse resultado; os botões manuais ficam como fallback.
 */
export function situacaoMensageria(ultimoContato: ResultadoContato | null | undefined): {
  label: string;
  tone: "ok" | "warn" | "neutral";
} {
  if (ultimoContato === "aceitou_visita") return { label: "Vai à visita", tone: "ok" };
  if (ultimoContato === "nao_atendeu") return { label: "Não respondeu", tone: "warn" };
  return { label: "Aguardando contato", tone: "neutral" };
}

export function registrarResultadoContato(alunoId: string, resultado: ResultadoContato) {
  // TODO: POST /api/v1/creche/novos-alunos/{alunoId}/contato { resultado }
  // grava em `evento` (tipo = contato_tentado/contato_confirmado/recusado), ator = servidor da creche.
  // "recusou" também dispara o fluxo de recusa: PATCH status -> recusado — a criança sai da lista
  // de convocados desta unidade (não aparece mais em "Novos Alunos").
  console.info("registrarResultadoContato", alunoId, resultado);
}
