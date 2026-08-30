import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getConvocacoes, getPainelResumo } from "../api/client";
import type { Convocacao, FilaConvocacao } from "../api/types";
import {
  Page,
  Card,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  StatusPill,
  STATUS_LABEL,
  STATUS_ENCERRADOS,
  Button,
  fmtHoras,
  fmtInt,
  fmtQuando,
  prazoTexto,
  toneByHoras,
} from "../design-system";
import { UnidadeSelect } from "../components/Filters";
import { useArea } from "../areas/AreaContext";

const PAGE_SIZE = 50;

const FILAS: { id: FilaConvocacao | ""; label: string; tone?: "danger" | "warn"; conta: (r: Contagens) => number | undefined }[] = [
  { id: "", label: "Todas", conta: () => undefined },
  { id: "vencidas", label: "Vencidas", tone: "danger", conta: (r) => r.vencidas },
  { id: "vencem_24h", label: "Vencem em 24 h", tone: "warn", conta: (r) => r.vencem_24h },
  { id: "sem_aviso", label: "Sem aviso", tone: "warn", conta: (r) => r.sem_aviso },
  { id: "aguardando", label: "Aguardando a família", conta: (r) => r.aguardando_familia },
  { id: "abertas", label: "Todas as abertas", conta: (r) => r.abertas },
  { id: "encerradas", label: "Encerradas", conta: (r) => r.encerradas },
];

interface Contagens {
  vencidas?: number;
  vencem_24h?: number;
  sem_aviso?: number;
  aguardando_familia?: number;
  abertas?: number;
  encerradas?: number;
}

export default function ConvocacoesPage() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { cre, base } = useArea();
  const unidade = sp.get("unidade") ?? "";
  const status = sp.get("status") ?? "";
  const filaParam = (sp.get("fila") ?? "") as FilaConvocacao | "";
  const fila: FilaConvocacao | "" = filaParam === "trabalho" ? "abertas" : filaParam;
  const [page, setPage] = useState(1);

  function setParam(k: string, v: string | null) {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    setSp(next, { replace: true });
    setPage(1);
  }

  const q = useQuery({
    queryKey: ["convocacoes", { cre, unidade, status, fila, page }],
    queryFn: () =>
      getConvocacoes({
        cre: cre || undefined,
        unidade: unidade || undefined,
        status: status || undefined,
        fila: fila || undefined,
        page,
        size: PAGE_SIZE,
      }),
    refetchInterval: 60_000,
  });
  const resumo = useQuery({
    queryKey: ["painel-resumo", { cre, unidade }],
    queryFn: () => getPainelResumo({ cre: cre || undefined, unidade: unidade || undefined }),
    refetchInterval: 60_000,
  });
  const contagens: Contagens = resumo.data
    ? {
        vencidas: resumo.data.vencidas,
        vencem_24h: resumo.data.vencem_24h,
        sem_aviso: resumo.data.sem_aviso ?? resumo.data.sem_contato,
        aguardando_familia: resumo.data.aguardando_familia,
        abertas: resumo.data.selecionadas_aguardando.total,
        encerradas: (resumo.data.confirmadas ?? 0) + (resumo.data.recusadas ?? 0) + (resumo.data.expiradas ?? 0),
      }
    : {};

  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filaAtual = FILAS.find((f) => f.id === fila);

  return (
    <Page
      title={cre ? `Convocações · ${cre}ª CRE` : "Convocações"}
      subtitle="Cada linha é uma criança chamada para uma vaga. Escolha uma fila e trabalhe de cima para baixo: a lista vem da mais urgente para a menos."
      actions={
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          Imprimir lista
        </Button>
      }
    >
      {!cre && (
        <div className="alert alert-info no-print">
          <strong>Escolha a sua CRE</strong> no menu azul acima para ver só o seu território.
        </div>
      )}
      <div className="chips" role="tablist" aria-label="Fila de trabalho">
        {FILAS.map((f) => {
          const n = f.conta(contagens);
          return (
            <button
              key={f.id || "todas"}
              type="button"
              role="tab"
              aria-selected={fila === f.id}
              className={`chip ${fila === f.id ? "active" : ""} ${f.tone ? `chip-${f.tone}` : ""}`.trim()}
              onClick={() => setParam("fila", f.id || null)}
            >
              {f.label}
              {n != null && <span className="chip-n">{fmtInt(n)}</span>}
            </button>
          );
        })}
      </div>
      <div className="filters">
        <UnidadeSelect value={unidade} onChange={(v) => setParam("unidade", v || null)} cre={cre} />
        <label className="field">
          <span>Situação</span>
          <select value={status} onChange={(e) => setParam("status", e.target.value || null)}>
            <option value="">Todas</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card flush>
        {q.isLoading && <Spinner label="Buscando convocações…" />}
        {q.isError && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={q.error} />
          </div>
        )}
        {q.data && q.data.items.length === 0 && (
          <EmptyState title={filaAtual && fila ? `Nada em "${filaAtual.label}" neste recorte` : "Nenhuma convocação neste recorte"}>
            <p>
              {fila === "vencidas"
                ? "Boa notícia: nenhuma vaga com prazo vencido aqui."
                : "As convocações são geradas pelo Nível Central; quando saírem, aparecem aqui. Troque a fila ou o filtro de unidade."}
            </p>
          </EmptyState>
        )}
        {q.data && q.data.items.length > 0 && (
          <DataTable<Convocacao>
            rows={q.data.items}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`${base}/convocacoes/${c.id}`)}
            rowClass={(c) => {
              if (STATUS_ENCERRADOS.includes(c.status)) return undefined;
              if (c.atrasada) return "row-danger";
              const t = toneByHoras(c.horas_no_status);
              return t === "danger" ? "row-danger" : t === "warn" ? "row-warn" : undefined;
            }}
            columns={[
              {
                key: "crianca",
                header: "Criança",
                render: (c) => (
                  <div>
                    <strong>{c.aluno_anon ?? `inscrição #${c.inscricao_id}`}</strong>
                    <div className="text-sm muted">
                      {c.grupamento} · {c.horario}
                    </div>
                  </div>
                ),
              },
              {
                key: "unidade",
                header: "Unidade",
                render: (c) => (
                  <div>
                    {c.unidade_nome ?? c.unidade_codigo}
                    {c.cre && <div className="text-sm muted">{c.cre}ª CRE</div>}
                  </div>
                ),
                sortValue: (c) => c.unidade_nome ?? c.unidade_codigo,
              },
              { key: "status", header: "Situação", render: (c) => <StatusPill status={c.status} /> },
              {
                key: "prazo",
                header: "Prazo",
                render: (c) =>
                  STATUS_ENCERRADOS.includes(c.status) ? (
                    <span className="muted">—</span>
                  ) : (
                    <div>
                      <span className={c.atrasada ? "text-sm" : undefined} style={c.atrasada ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
                        {prazoTexto(c.prazo_fim)}
                      </span>
                      <div className="text-sm muted">{fmtQuando(c.prazo_fim)}</div>
                    </div>
                  ),
                sortValue: (c) => (c.prazo_fim ? new Date(c.prazo_fim).getTime() : 0),
              },
              {
                key: "tempo",
                header: "Nesta situação há",
                render: (c) => <span className="tabular">{fmtHoras(c.horas_no_status)}</span>,
                sortValue: (c) => c.horas_no_status,
              },
              {
                key: "tentativas",
                header: "Tentativas",
                numeric: true,
                render: (c) => (c.n_tentativas == null ? "—" : fmtInt(c.n_tentativas)),
                sortValue: (c) => c.n_tentativas ?? 0,
              },
              {
                key: "acao",
                header: "Próxima ação",
                render: (c) => (c.proxima_acao ? <span className="text-sm">{c.proxima_acao}</span> : <span className="muted">—</span>),
              },
            ]}
            footer={
              <>
                <span>
                  {fmtInt(total)} convocação(ões) · página {page} de {pages} · clique na linha para abrir
                </span>
                <span className="row no-print">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    ‹ Anterior
                  </Button>
                  <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Próxima ›
                  </Button>
                </span>
              </>
            }
          />
        )}
      </Card>
      <p className="text-sm muted no-print">
        Vaga liberada por recusa ou prazo vencido? Abra a convocação: ela mostra quem é o próximo da fila da unidade.{" "}
        <Link to={base || "/"}>Voltar ao painel</Link>
      </p>
    </Page>
  );
}
