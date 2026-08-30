/**
 * Alertas do painel da creche/EDI.
 *
 * TODO backend: em produção o alerta de descompasso vira um cálculo no próprio `GET` do painel,
 * comparando `capacidade.vagas` com `COUNT(convocacao) WHERE status = 'confirmada'`
 * (`ocupacaoStore.ts` já simula esse número) contra a fila de espera real (`alocacao.status =
 * 'lista_espera'`, `GET /unidades/{codigo}/fila`). A confirmação diária ("sim, está certo") ainda
 * não tem tabela própria — hoje fica em `localStorage` só para a demo lembrar o que já foi
 * confirmado hoje entre recarregamentos de página; em produção seria um `evento` por unidade+dia.
 */
import { useSyncExternalStore } from "react";
import { UNIDADE_EXEMPLO } from "./mock";

const CHAVE_STORAGE = `creche:confirmacaoVagas:${UNIDADE_EXEMPLO.codigo}`;

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function lerUltimaConfirmacao(): string | null {
  try {
    return localStorage.getItem(CHAVE_STORAGE);
  } catch {
    return null;
  }
}

let ultimaConfirmacao = lerUltimaConfirmacao();
const ouvintes = new Set<() => void>();

function emitir() {
  for (const ouvinte of ouvintes) ouvinte();
}

function subscribe(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** true quando a unidade ainda não confirmou o número de vagas ocupadas hoje. */
function precisaConfirmarHoje(): boolean {
  return ultimaConfirmacao !== hojeISO();
}

/** Alerta 1 — lembrete diário para a unidade conferir se "vagas ocupadas" está certo. */
export function useConfirmacaoDiariaDeVagas() {
  const precisaConfirmar = useSyncExternalStore(subscribe, precisaConfirmarHoje);
  return {
    precisaConfirmar,
    confirmar() {
      ultimaConfirmacao = hojeISO();
      try {
        localStorage.setItem(CHAVE_STORAGE, ultimaConfirmacao);
      } catch {
        // localStorage indisponível (ex.: modo privado) — a demo só perde a persistência entre recargas
      }
      emitir();
    },
  };
}

/**
 * Alerta 2 — descompasso entre vagas ocupadas e disponíveis enquanto ainda há gente esperando.
 * Dispara quando o número ocupado diverge do total de vagas (sobrou vaga não preenchida, ou foi
 * preenchida além do informado) e a fila de espera desta unidade não está vazia — sinal de que dá
 * para chamar mais alguém da fila em vez de deixar a família esperando.
 */
export function temDescompassoDeVagas(totalVagas: number, totalOcupadas: number, pessoasNaFila: number): boolean {
  return pessoasNaFila > 0 && totalOcupadas !== totalVagas;
}
