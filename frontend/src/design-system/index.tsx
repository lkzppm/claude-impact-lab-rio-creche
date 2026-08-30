import { ReactNode, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import "./tokens.css";
import "./components.css";

/* ---------- AppHeader ---------- */
const NAV = [
  { to: "/", label: "Painel", end: true },
  { to: "/convocacoes", label: "Convocações" },
  { to: "/classificacao", label: "Classificação" },
  { to: "/inscricoes", label: "Inscrições" },
  { to: "/unidades", label: "Unidades" },
];

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="container">
        <Link to="/" className="app-brand" aria-label="Inscrição Creche · SME-Rio">
          <span className="app-brand-mark" aria-hidden="true">
            IC
          </span>
          <span>
            Inscrição Creche
            <small>SME-Rio · Retaguarda</small>
          </span>
        </Link>
        <nav aria-label="Principal">
          <ul className="app-nav">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
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
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={`stat-tile tone-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
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
                {sort?.key === c.key && (sort.dir === 1 ? " ▲" : " ▼")}
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
  busy?: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
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
          <Button variant={danger ? "danger" : "primary"} onClick={() => onConfirm(note)} disabled={busy}>
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
