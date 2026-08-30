import { ReactNode, useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import "./tokens.css";
import "./components.css";

/* ---------- AppHeader — faixa branca com logos + barra azul (matricula.rio) ---------- */
import { AREA_LABEL, useArea } from "../areas/AreaContext";
import { CRES } from "../components/Filters";
import { Meter } from "./viz";
import type { VizTone } from "./viz";

export * from "./viz";

const NAV_POR_AREA: Record<string, { to: string; label: string; end?: boolean }[]> = {
  familia: [
    { to: "/familia", label: "Minha inscrição", end: true },
  ],
  cre: [
    { to: "/cre", label: "Painel", end: true },
    { to: "/cre/convocacoes", label: "Convocações" },
    { to: "/cre/multireserva", label: "Várias reservas" },
    { to: "/cre/unidades", label: "Unidades" },
  ],
  sme: [
    { to: "/sme", label: "Rede", end: true },
    { to: "/sme/classificacao", label: "Classificação" },
    { to: "/sme/inscricoes", label: "Inscrições" },
    { to: "/sme/unidades", label: "Unidades" },
    { to: "/sme/regua", label: "Régua" },
  ],
};

function CampoAtor() {
  const { ator, setAtor } = useArea();
  const [v, setV] = useState(ator);
  useEffect(() => setV(ator), [ator]);
  return (
    <label className="app-ator" title="Seu nome ou matrícula: fica registrado em cada ação, com data e hora">
      <span>Você</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => setAtor(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="seu nome"
        aria-label="Quem está registrando"
        maxLength={80}
      />
    </label>
  );
}

export function AppHeader() {
  const { area, cre, setCre } = useArea();
  const nav = area ? NAV_POR_AREA[area] : [];
  return (
    <header className="app-header">
      <div className="app-logos">
        <div className="container">
          <Link to="/" className="app-logo" aria-label="Prefeitura do Rio · Educação — início">
            <img src="/logo-prefeitura-rio-educacao.png" alt="Prefeitura do Rio · Educação" className="app-logo-pref" />
          </Link>
          <img src="/logo-matricula-carioca.png" alt="Matrícula Carioca" className="app-logo-mat" />
        </div>
      </div>
      <div className="app-bar">
        <div className="container">
          {area ? (
            <>
              <span className="app-area">{AREA_LABEL[area]}</span>
              <nav aria-label="Principal">
                <ul className="app-nav">
                  {nav.map((n) => (
                    <li key={n.to}>
                      <NavLink to={n.to} end={n.end}>
                        {n.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
              {area === "cre" && (
                <>
                  <label className="app-cre">
                    <span>CRE</span>
                    <select value={cre} onChange={(e) => setCre(e.target.value)} aria-label="Escolher a CRE">
                      <option value="">Escolha…</option>
                      {CRES.map((c) => (
                        <option key={c} value={c}>
                          {c}ª CRE
                        </option>
                      ))}
                    </select>
                  </label>
                  <CampoAtor />
                </>
              )}
              <Link to="/" className="app-trocar">
                Trocar de perfil
              </Link>
            </>
          ) : (
            <span className="app-area">Inscrição Creche · SME-Rio</span>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------- Page ---------- */
export interface Crumb {
  label: string;
  to?: string;
}

export function Page({
  title,
  subtitle,
  crumbs,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="page">
      <div className="container">
        <div className="page-head">
          <div>
            {crumbs && crumbs.length > 0 && (
              <ol className="breadcrumb" aria-label="Você está em">
                {crumbs.map((c, i) => (
                  <li key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>
                ))}
              </ol>
            )}
            <h1>{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
        <div className="stack">{children}</div>
      </div>
    </main>
  );
}

/* ---------- Button ---------- */
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "primary",
  size,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm";
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  variant = "secondary",
  size,
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: "sm";
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""}`.trim()}>
      {children}
    </Link>
  );
}

/* ---------- Card ---------- */
export function Card({
  title,
  actions,
  flush,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${flush ? "card-flush" : ""} ${className}`.trim()}>
      {(title || actions) && (
        <div className="card-head" style={flush ? { padding: "16px 24px 0" } : undefined}>
          {title && <h2 className="card-title" style={{ marginBottom: 0 }}>{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- StatTile ---------- */
export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

export function StatTile({
  label,
  value,
  hint,
  tone = "info",
  to,
  share,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  /** quando informado, o tile vira link para a lista já filtrada */
  to?: string;
  /** razão 0–1 mostrada como medidor sob o número (ex.: parte das convocações abertas) */
  share?: number;
}) {
  const corpo = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {share != null && <Meter share={share} tone={tone as VizTone} label={`${label} — parte do total`} />}
      {(hint || to) && (
        <span className="stat-hint">
          {hint}
          {to && <span className="stat-cta"> ver lista →</span>}
        </span>
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={`stat-tile stat-tile-link tone-${tone}`}>
        {corpo}
      </Link>
    );
  }
  return <div className={`stat-tile tone-${tone}`}>{corpo}</div>;
}

/* ---------- StatusPill ---------- */
export type ConvocacaoStatus =
  | "selecionada"
  | "contato_tentado"
  | "contato_confirmado"
  | "confirmada"
  | "recusada"
  | "expirada"
  | "liberada";

export const STATUS_LABEL: Record<ConvocacaoStatus, string> = {
  selecionada: "Selecionada",
  contato_tentado: "Tentando contato",
  contato_confirmado: "Família avisada",
  confirmada: "Matrícula confirmada",
  recusada: "Recusada",
  expirada: "Prazo vencido",
  liberada: "Liberada",
};

const STATUS_TONE: Record<ConvocacaoStatus, Tone> = {
  selecionada: "info",
  contato_tentado: "warn",
  contato_confirmado: "info",
  confirmada: "ok",
  recusada: "neutral",
  expirada: "danger",
  liberada: "neutral",
};

/** convocações que não pedem mais ação */
export const STATUS_ENCERRADOS: string[] = ["confirmada", "recusada", "expirada", "liberada"];

/** rótulos dos tipos de evento gravados no log (nomes exatamente como o backend grava) */
export const EVENTO_LABEL: Record<string, string> = {
  selecionada: "Vaga selecionada para a criança",
  selecionada_da_lista: "Convocada da lista de espera — vaga liberada por outra criança",
  contato_tentado: "Tentativa de contato",
  contato_confirmado: "Família avisada",
  confirmada: "Matrícula confirmada",
  recusada: "Família recusou a vaga",
  expirada: "Prazo vencido",
  liberada_por_confirmacao: "Vaga liberada — a família confirmou em outra unidade",
  capacidade_informada: "Capacidade informada pela unidade",
};

export const CANAIS: { id: string; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "ligacao", label: "Ligação" },
  { id: "sms", label: "SMS" },
  { id: "email", label: "E-mail" },
  { id: "visita", label: "Visita / agente" },
];
export const CANAL_LABEL: Record<string, string> = Object.fromEntries(CANAIS.map((c) => [c.id, c.label]));
CANAL_LABEL.painel_familia = "pelo painel da família";

/* ---------- PrazoBar — relógio da convocação (0–72 h) ---------- */
export function PrazoBar({ prazoFim, status }: { prazoFim: string | null | undefined; status: string }) {
  if (!prazoFim || STATUS_ENCERRADOS.includes(status)) return null;
  const fim = new Date(prazoFim).getTime();
  if (Number.isNaN(fim)) return null;
  const inicio = fim - 72 * 36e5;
  const pct = Math.max(0, Math.min(1, (Date.now() - inicio) / (fim - inicio)));
  const tone: Tone = pct >= 1 ? "danger" : pct >= 0.66 ? "warn" : "ok";
  return (
    <div className="prazo">
      <div className={`prazo-bar tone-${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
        <div className="prazo-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <div className="prazo-legenda">
        {prazoTexto(prazoFim)} · {fmtQuando(prazoFim)}
      </div>
    </div>
  );
}

/* ---------- comprovações ---------- */
const COMPROVACAO: Record<string, { label: string; tone: Tone }> = {
  confirmado: { label: "Confirmado", tone: "ok" },
  nao_encontrado: { label: "Não encontrado", tone: "warn" },
  erro: { label: "Erro na consulta", tone: "danger" },
  pendente: { label: "Pendente", tone: "neutral" },
};

export function ComprovacaoPill({ resultado }: { resultado: string }) {
  const c = COMPROVACAO[resultado] ?? { label: resultado, tone: "neutral" as Tone };
  return <span className={`pill pill-${c.tone}`}>{c.label}</span>;
}

/* ---------- tipo de alocação ---------- */
export function TipoAlocacaoPill({ tipo }: { tipo?: string | null }) {
  if (!tipo) return <span className="muted">—</span>;
  return tipo === "presa" ? <span className="pill pill-info">Vaga reservada</span> : <span className="pill pill-neutral">Alternativa na fila</span>;
}

export function StatusPill({ status }: { status: string }) {
  const s = status as ConvocacaoStatus;
  const tone = STATUS_TONE[s] ?? "neutral";
  const label = STATUS_LABEL[s] ?? status;
  return <span className={`pill pill-${tone}`}>{label}</span>;
}

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/* ---------- DataTable ---------- */
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  sortValue?: (row: T) => number | string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClass,
  onRowClick,
  selectedKey,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  rowClass?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  selectedKey?: string | number | null;
  footer?: ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sorted = (() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  })();

  function toggleSort(col: Column<T>) {
    if (!col.sortValue) return;
    setSort((s) => (s?.key === col.key ? { key: col.key, dir: s.dir === 1 ? -1 : 1 } : { key: col.key, dir: 1 }));
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.numeric ? "num" : ""} ${c.sortValue ? "sortable" : ""}`.trim()}
                onClick={() => toggleSort(c)}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
              >
                {c.header}
                {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const k = rowKey(r);
            const cls = [rowClass?.(r), onRowClick ? "clickable" : "", selectedKey === k ? "selected" : ""]
              .filter(Boolean)
              .join(" ");
            return (
              <tr key={k} className={cls || undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? "num" : undefined}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer && <div className="table-foot">{footer}</div>}
    </div>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

/* ---------- Spinner ---------- */
export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

/* ---------- ErrorBox ---------- */
export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="alert alert-danger" role="alert">
      Não foi possível carregar os dados. {msg}
    </div>
  );
}

/* ---------- ConfirmDialog ---------- */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  danger,
  withNote,
  withCanal,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  withNote?: boolean;
  /** pede por qual canal o contato foi feito (WhatsApp, ligação…) */
  withCanal?: boolean;
  busy?: boolean;
  onConfirm: (note: string, canal?: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [canal, setCanal] = useState<string>("");
  useEffect(() => {
    if (!open) {
      setNote("");
      setCanal("");
    }
  }, [open]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dlg-title" style={{ fontSize: "var(--fs-lg)" }}>
          {title}
        </h2>
        {description && <p className="text-sm muted">{description}</p>}
        {withCanal && (
          <div className="field">
            <span>Por qual canal?</span>
            <div className="chips" role="radiogroup" aria-label="Canal do contato">
              {CANAIS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={canal === c.id}
                  className={`chip ${canal === c.id ? "active" : ""}`}
                  onClick={() => setCanal(canal === c.id ? "" : c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {withNote && (
          <label className="field">
            <span>Observação (opcional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: falou com a mãe às 14h, vai comparecer amanhã" />
          </label>
        )}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => onConfirm(note, canal || undefined)} disabled={busy}>
            {busy ? "Registrando…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

/* ---------- helpers ---------- */
export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "sáb., 30/08 14:00" — para prazos, na linguagem do polo */
export function fmtQuando(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtHoras(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return "menos de 1h";
  if (h < 48) return `${Math.round(h)}h`;
  const dias = Math.floor(h / 24);
  const resto = Math.round(h % 24);
  return resto ? `${dias}d ${resto}h` : `${dias} dias`;
}

export function prazoTexto(prazoFim: string | null | undefined): string {
  if (!prazoFim) return "sem prazo";
  const ms = new Date(prazoFim).getTime() - Date.now();
  const h = ms / 36e5;
  if (h < 0) return `venceu há ${fmtHoras(-h)}`;
  if (h < 24) return `vence em ${Math.max(1, Math.round(h))}h`;
  const d = Math.ceil(h / 24);
  return d === 1 ? "vence em 1 dia" : `vence em ${d} dias`;
}

export function toneByHoras(h: number | null | undefined): Tone {
  if (h == null) return "neutral";
  if (h >= 72) return "danger";
  if (h >= 48) return "warn";
  return "ok";
}
