/* Visualizações leves do painel — barras empilhadas, listas de barras e medidores.
   Sem biblioteca: HTML + CSS com os tokens do matricula.rio. Regras seguidas (skill dataviz):
   marcas finas (≤ 16 px), 2 px de respiro entre segmentos, ponta arredondada só no lado do dado,
   legenda sempre presente com ≥ 2 séries, rótulo direto só onde cabe, texto em cor de texto (nunca na cor da série),
   e a tabela continua na página como leitura alternativa. Paleta validada em light: #1e7f4f · #028fbe · #c98500 · #b8421a. */
import { ReactNode } from "react";
import { Link } from "react-router-dom";

export type VizTone = "ok" | "info" | "warn" | "danger" | "neutral";

export interface Segmento {
  label: string;
  value: number;
  tone: VizTone;
  /** explicação curta que aparece no hover e na legenda */
  hint?: string;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** Barra empilhada horizontal (parte-de-um-todo). `max` permite comparar barras entre si numa mesma escala. */
export function StackedBar({
  segmentos,
  max,
  legenda = true,
  rotulos = true,
  altura = 16,
  ariaLabel,
}: {
  segmentos: Segmento[];
  /** escala da barra; padrão = soma dos segmentos (barra cheia) */
  max?: number;
  legenda?: boolean;
  /** valor dentro do segmento quando ele tem largura para isso */
  rotulos?: boolean;
  altura?: number;
  ariaLabel?: string;
}) {
  const soma = segmentos.reduce((a, s) => a + s.value, 0);
  const escala = Math.max(max ?? soma, 1);
  const resumo = segmentos.map((s) => `${s.label}: ${fmt(s.value)}`).join(" · ");
  return (
    <div className="viz">
      <div className="viz-stack" style={{ height: altura }} role="img" aria-label={ariaLabel ? `${ariaLabel} — ${resumo}` : resumo}>
        {segmentos
          .filter((s) => s.value > 0)
          .map((s) => {
            const largura = (s.value / escala) * 100;
            const cabe = rotulos && largura >= 9 && altura >= 14;
            return (
              <div
                key={s.label}
                className={`viz-seg tone-${s.tone}`}
                style={{ width: `${largura}%` }}
                title={`${s.label}: ${fmt(s.value)} (${pct(s.value, soma)}%)${s.hint ? ` — ${s.hint}` : ""}`}
              >
                {cabe && <span className="viz-seg-label">{fmt(s.value)}</span>}
              </div>
            );
          })}
      </div>
      {legenda && (
        <ul className="viz-legend">
          {segmentos.map((s) => (
            <li key={s.label} title={s.hint}>
              <span className={`viz-swatch tone-${s.tone}`} aria-hidden="true" />
              <span>{s.label}</span>
              <strong>{fmt(s.value)}</strong>
              {soma > 0 && <span className="muted">({pct(s.value, soma)}%)</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Legenda avulsa (para um conjunto de barras que compartilham as séries). */
export function Legenda({ itens }: { itens: { label: string; tone: VizTone; hint?: string }[] }) {
  return (
    <ul className="viz-legend">
      {itens.map((s) => (
        <li key={s.label} title={s.hint}>
          <span className={`viz-swatch tone-${s.tone}`} aria-hidden="true" />
          <span>{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

export interface ItemBarra {
  label: ReactNode;
  value: number;
  to?: string;
  hint?: string;
  /** destaque de um item (os outros ficam em cinza) */
  destaque?: boolean;
}

/** Lista de barras horizontais, uma série, um tom — magnitude comparável de cima para baixo. */
export function BarList({
  itens,
  max,
  tone = "info",
  formato = fmt,
  emfase = false,
}: {
  itens: ItemBarra[];
  max?: number;
  tone?: VizTone;
  formato?: (n: number) => string;
  /** quando true, só os itens com `destaque` levam cor; os demais ficam neutros */
  emfase?: boolean;
}) {
  const escala = Math.max(max ?? Math.max(0, ...itens.map((i) => i.value)), 1);
  return (
    <div className="viz-barlist" role="list">
      {itens.map((i, k) => {
        const t = emfase ? (i.destaque ? tone : "neutral") : tone;
        return (
          <div className="viz-barrow" role="listitem" key={k} title={i.hint}>
            <span className="viz-barlabel">{i.to ? <Link to={i.to}>{i.label}</Link> : i.label}</span>
            <div className="viz-track" aria-hidden="true">
              <div className={`viz-fill tone-${t}`} style={{ width: `${(i.value / escala) * 100}%` }} />
            </div>
            <span className="viz-value">{formato(i.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Medidor: uma razão contra um limite. Trilho em passo claro do mesmo tom. */
export function Meter({ share, tone = "info", label }: { share: number; tone?: VizTone; label?: string }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
  return (
    <div
      className={`meter tone-${tone}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-label={label}
      title={label ? `${label}: ${Math.round(p * 100)}%` : `${Math.round(p * 100)}%`}
    >
      <div className="meter-fill" style={{ width: `${Math.round(p * 100)}%` }} />
    </div>
  );
}

/** Número-chave de uma tela (um por página). */
export function Hero({ value, label, hint }: { value: ReactNode; label: string; hint?: ReactNode }) {
  return (
    <div className="viz-hero">
      <span className="viz-hero-value">{value}</span>
      <span className="viz-hero-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

/* ---------- Donut — parte-de-um-todo de relance (≤ 6 fatias), com o total no centro ---------- */
export interface Fatia extends Segmento {
  to?: string;
}

function arco(cx: number, cy: number, r: number, a0: number, a1: number): string {
  // ângulos em radianos, sentido horário a partir do topo
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${grande} 1 ${x1} ${y1}`;
}

export function Donut({
  fatias,
  centro,
  centroLabel,
  tamanho = 200,
  espessura = 30,
  onFatia,
  ariaLabel,
}: {
  fatias: Fatia[];
  /** número-chave no centro (normalmente o total) */
  centro: ReactNode;
  centroLabel?: string;
  tamanho?: number;
  espessura?: number;
  /** clique numa fatia (ex.: abrir a lista filtrada) */
  onFatia?: (f: Fatia) => void;
  ariaLabel?: string;
}) {
  const total = fatias.reduce((a, f) => a + f.value, 0);
  const cx = tamanho / 2;
  const r = (tamanho - espessura) / 2;
  const resumo = fatias.map((f) => `${f.label}: ${fmt(f.value)} (${pct(f.value, total)}%)`).join(" · ");
  let ang = 0;
  const cor: Record<VizTone, string> = {
    ok: "var(--viz-ok)",
    info: "var(--viz-info)",
    warn: "var(--viz-warn)",
    danger: "var(--viz-danger)",
    neutral: "var(--viz-neutral)",
  };
  return (
    <div className="donut-wrap">
      <svg
        className="donut"
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        role="img"
        aria-label={ariaLabel ? `${ariaLabel} — ${resumo}` : resumo}
      >
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--mr-grey-200)" strokeWidth={espessura} />
        {total > 0 &&
          fatias
            .filter((f) => f.value > 0)
            .map((f) => {
              const a0 = ang;
              const a1 = ang + (f.value / total) * 2 * Math.PI;
              ang = a1;
              const cheia = a1 - a0 >= 2 * Math.PI - 1e-6;
              const d = cheia ? `M ${cx} ${cx - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cx - r}` : arco(cx, cx, r, a0, a1);
              return (
                <g key={f.label} className={onFatia && f.to ? "donut-fatia clicavel" : "donut-fatia"} onClick={onFatia ? () => onFatia(f) : undefined}>
                  <title>{`${f.label}: ${fmt(f.value)} (${pct(f.value, total)}%)${f.hint ? ` — ${f.hint}` : ""}`}</title>
                  {/* respiro de 2 px na cor da superfície entre fatias */}
                  <path d={d} fill="none" stroke="var(--mr-white)" strokeWidth={espessura + 4} strokeLinecap="butt" />
                  <path d={d} fill="none" stroke={cor[f.tone]} strokeWidth={espessura} strokeLinecap="butt" />
                </g>
              );
            })}
        <text x={cx} y={cx - 4} textAnchor="middle" className="donut-centro">
          {centro}
        </text>
        {centroLabel && (
          <text x={cx} y={cx + 16} textAnchor="middle" className="donut-centro-label">
            {centroLabel}
          </text>
        )}
      </svg>
      <ul className="viz-legend donut-legend">
        {fatias.map((f) => (
          <li key={f.label} title={f.hint}>
            <span className={`viz-swatch tone-${f.tone}`} aria-hidden="true" />
            <span>{f.to ? <Link to={f.to}>{f.label}</Link> : f.label}</span>
            <strong>{fmt(f.value)}</strong>
            {total > 0 && <span className="muted">({pct(f.value, total)}%)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
