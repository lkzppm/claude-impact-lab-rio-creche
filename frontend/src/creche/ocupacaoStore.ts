/**
 * Log de vagas ocupadas por segmento, compartilhado entre "Novos Alunos" (onde a aprovação
 * automática acontece) e "Administração de Vagas" (onde a unidade acompanha e corrige o número).
 *
 * TODO backend: em produção isto é `COUNT(convocacao) WHERE status = 'confirmada'` por
 * grupamento/unidade (a tabela já existe — `backend/app/models.py::Convocacao`), com o registro de
 * quem foi aprovado vindo do `evento` (tipo `confirmada`, payload com o nome). O acréscimo/remoção
 * manual (criança fora do sistema) viraria um evento próprio, não uma tabela nova. Aqui é um store
 * local em memória (`useSyncExternalStore`) só para a demo funcionar sem esse endpoint.
 */
import { useSyncExternalStore } from "react";
import { NOVOS_ALUNOS_EXEMPLO, Segmento, UNIDADE_EXEMPLO } from "./mock";

export interface OcupacaoEvento {
  id: string;
  segmento: Segmento;
  nome: string;
  origem: "sistema" | "manual";
  quando: string; // ISO
  ocupadasAntes: number;
  ocupadasDepois: number;
}

const SEGMENTOS: Segmento[] = ["bercario", "maternal_1", "maternal_2"];

let proximoId = 1;
let eventos: OcupacaoEvento[] = [];

// `useSyncExternalStore` exige que `getSnapshot` devolva a MESMA referência entre chamadas
// enquanto nada mudou — por isso os snapshots ficam em cache e só são recalculados em `emitir()`.
let contagemCache: Record<Segmento, number> = { bercario: 0, maternal_1: 0, maternal_2: 0 };
let recentesCache: Record<Segmento, OcupacaoEvento[]> = { bercario: [], maternal_1: [], maternal_2: [] };

function ehHojeOuOntem(iso: string): boolean {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  return mesmoDia(d, hoje) || mesmoDia(d, ontem);
}

function recalcularCache() {
  const novaContagem = { bercario: 0, maternal_1: 0, maternal_2: 0 } as Record<Segmento, number>;
  const novosRecentes = { bercario: [], maternal_1: [], maternal_2: [] } as Record<Segmento, OcupacaoEvento[]>;
  for (const s of SEGMENTOS) {
    const doSegmento = eventos.filter((e) => e.segmento === s);
    novaContagem[s] = doSegmento.length;
    novosRecentes[s] = doSegmento.filter((e) => ehHojeOuOntem(e.quando)).sort((a, b) => b.quando.localeCompare(a.quando));
  }
  contagemCache = novaContagem;
  recentesCache = novosRecentes;
}

function contagemAtual(segmento: Segmento): number {
  return eventos.filter((e) => e.segmento === segmento).length;
}

function seed() {
  for (const a of NOVOS_ALUNOS_EXEMPLO) {
    if (a.unidadeCodigo === UNIDADE_EXEMPLO.codigo && a.status === "aprovado") {
      const antes = contagemAtual(a.segmento);
      eventos.push({
        id: `seed-${proximoId++}`,
        segmento: a.segmento,
        nome: a.nome,
        origem: "sistema",
        quando: a.aprovadoEm ?? new Date().toISOString(),
        ocupadasAntes: antes,
        ocupadasDepois: antes + 1,
      });
    }
  }
  recalcularCache();
}
seed();

const ouvintes = new Set<() => void>();
function emitir() {
  recalcularCache();
  for (const ouvinte of ouvintes) ouvinte();
}

function registrar(segmento: Segmento, nome: string, origem: OcupacaoEvento["origem"]) {
  const antes = contagemAtual(segmento);
  eventos = [
    ...eventos,
    { id: `ev-${proximoId++}`, segmento, nome, origem, quando: new Date().toISOString(), ocupadasAntes: antes, ocupadasDepois: antes + 1 },
  ];
  emitir();
}

/** Chamado quando uma matrícula é confirmada via convocação (aprovação em "Novos Alunos"). */
export function registrarAprovacao(segmento: Segmento, nome: string) {
  registrar(segmento, nome, "sistema");
}

/** Criança que entrou fora do sistema — a creche informa só o nome. */
export function adicionarManual(segmento: Segmento, nome: string) {
  registrar(segmento, nome, "manual");
}

/** Só entradas manuais podem ser retiradas — o que veio do sistema é o registro real da convocação. */
export function removerManual(id: string) {
  const alvo = eventos.find((e) => e.id === id);
  if (!alvo || alvo.origem !== "manual") return;
  eventos = eventos.filter((e) => e.id !== id);
  emitir();
}

function subscribe(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Vagas ocupadas por segmento, reativo — usa em qualquer componente que precise deste número. */
export function useOcupacaoPorSegmento(): Record<Segmento, number> {
  return useSyncExternalStore(subscribe, () => contagemCache);
}

/** Entradas de hoje e ontem para um segmento, mais recente primeiro — o que a unidade revisa. */
export function useEventosRecentes(segmento: Segmento): OcupacaoEvento[] {
  return useSyncExternalStore(subscribe, () => recentesCache[segmento]);
}
