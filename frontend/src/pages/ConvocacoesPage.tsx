import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getConvocacoes } from "../api/client";
import type { Convocacao } from "../api/types";
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
  prazoTexto,
  toneByHoras,
} from "../design-system";
import { CreSelect, UnidadeSelect } from "../components/Filters";

const PAGE_SIZE = 50;

export default function ConvocacoesPage() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const cre = sp.get("cre") ?? "";
  const unidade = sp.get("unidade") ?? "";
  const status = sp.get("status") ?? "";
  const atrasadas = sp.get("atrasadas") === "1";
  const [page, setPage] = useState(1);

  function setParam(k: string, v: string | null) {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    setSp(next, { replace: true });
    setPage(1);
  }

  const q = useQuery({
    queryKey: ["convocacoes", { cre, unidade, status, atrasadas, page }],
    queryFn: () =>
      getConvocacoes({
        cre: cre || undefined,
        unidade: unidade || undefined,
        status: status || undefined,
        atrasadas: atrasadas || undefined,
        page,
        size: PAGE_SIZE,
      }),
    refetchInterval: 60_000,
  });

  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page
      title="Convocações"
      subtitle="Cada linha é uma criança chamada para uma vaga. O tempo conta desde a última mudança de situação."
    >
      <div className="filters">
        <CreSelect value={cre} onChange={(v) => { setParam("cre", v || null); setParam("unidade", null); }} />
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
        <label className="checkbox" style={{ paddingBottom: 10 }}>
          <input type="checkbox" checked={atrasadas} onChange={(e) => setParam("atrasadas", e.target.checked ? "1" : null)} />
          Só as em atraso (mais de 3 dias)
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
          <EmptyState title="Nenhuma convocação neste recorte">
            <p>
              Se ainda não há convocações, rode uma classificação e clique em "Gerar convocações" na aba{" "}
              <Link to="/classificacao">Classificação</Link>.
            </p>
          </EmptyState>
        )}
        {q.data && q.data.items.length > 0 && (
          <DataTable<Convocacao>
            rows={q.data.items}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/convocacoes/${c.id}`)}
            rowClass={(c) => {
              if (STATUS_ENCERRADOS.includes(c.status)) return undefined;
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
                key: "tempo",
                header: "Nesta situação há",
                render: (c) => <span className="tabular">{fmtHoras(c.horas_no_status)}</span>,
                sortValue: (c) => c.horas_no_status,
              },
              {
                key: "prazo",
                header: "Prazo",
                render: (c) => (STATUS_ENCERRADOS.includes(c.status) ? <span className="muted">—</span> : prazoTexto(c.prazo_fim)),
                sortValue: (c) => (c.prazo_fim ? new Date(c.prazo_fim).getTime() : 0),
              },
              {
                key: "tentativas",
                header: "Tentativas",
                numeric: true,
                render: (c) => (c.n_tentativas == null ? "—" : fmtInt(c.n_tentativas)),
                sortValue: (c) => c.n_tentativas ?? 0,
              },
            ]}
            footer={
              <>
                <span>
                  {fmtInt(total)} convocação(ões) · página {page} de {pages}
                </span>
                <span className="row">
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
    </Page>
  );
}
