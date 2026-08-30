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

import { registrarEvento } from "../api/client";

const RESULTADO_PARA_TIPO_EVENTO: Record<ResultadoContato, string> = {
  aceitou_visita: "contato_confirmado",
  nao_atendeu: "contato_tentado",
  recusou: "recusada",
};

/**
 * Registra o resultado no backend real via `POST /convocacoes/{id}/eventos`
 * (`backend/app/routers/convocacoes.py`), que já implementa exatamente esta máquina de estados
 * (`selecionada → contato_tentado → contato_confirmado → confirmada|recusada|expirada`).
 *
 * A convocação é identificada pelo `id` numérico da tabela `convocacao` — os dados de exemplo deste
 * painel (`frontend/src/creche/mock.ts`) usam ids de mock (`"a1"`, `"a2"`, ...) porque ainda não há
 * seed real de convocações para uma unidade de creche/EDI. Quando o id do aluno vier do backend
 * (numérico), a chamada abaixo funciona sem alteração; até lá ela é pulada silenciosamente.
 */
export async function registrarResultadoContato(alunoId: string, resultado: ResultadoContato) {
  const idNumerico = Number(alunoId);
  if (!Number.isInteger(idNumerico)) {
    console.info("registrarResultadoContato (mock, sem convocação real)", alunoId, resultado);
    return;
  }
  return registrarEvento(idNumerico, { tipo: RESULTADO_PARA_TIPO_EVENTO[resultado], ator: "painel-creche" });
}
