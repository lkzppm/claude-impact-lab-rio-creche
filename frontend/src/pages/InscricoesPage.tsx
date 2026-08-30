import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getInscricoes, getProcessos } from "../api/client";
import type { Inscricao } from "../api/types";
import { Page, Card, DataTable, Spinner, ErrorBox, EmptyState, Button, fmtDateTime, fmtInt } from "../design-system";
import { UnidadeSelect } from "../components/Filters";
import { useBase } from "../areas/AreaContext";

const PAGE_SIZE = 50;

/** situações de opção registradas pela SME (spec/03) */
const SITUACOES = [
  "Confirmado",
  "Lista de espera",
  "Selecionado",
  "Selecionado da lista",
  "Ativo",
  "Cancelado",
  "Cancelado na confirmacao",
  "Cancelado pelo sistema",
];

export default function InscricoesPage() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const base = useBase();
  const ano = sp.get("ano") ?? "";
  const unidade = sp.get("unidade") ?? "";
  const situacao = sp.get("situacao") ?? "";
  const [page, setPage] = useState(1);

  function setParam(k: string, v: string | null) {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    setSp(next, { replace: true });
    setPage(1);
  }

  const processos = useQuery({ queryKey: ["processos"], queryFn: getProcessos });
  const q = useQuery({
    queryKey: ["inscricoes", { ano, unidade, situacao, page }],
    queryFn: () =>
      getInscricoes({
        ano: ano ? Number(ano) : undefined,
        unidade: unidade || undefined,
        situacao: situacao || undefined,
        page,
        size: PAGE_SIZE,
      }),
  });

  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page title="Inscrições" subtitle="Cada inscrição é uma criança em um processo, com até 5 opções de unidade e as respostas ao questionário.">
      <div className="filters">
        <label className="field">
          <span>Ano</span>
          <select value={ano} onChange={(e) => setParam("ano", e.target.value || null)}>
            <option value="">Todos</option>
            {(processos.data ?? []).map((p) => (
              <option key={p.ano} value={p.ano}>
                {p.ano}
              </option>
            ))}
          </select>
        </label>
        <UnidadeSelect value={unidade} onChange={(v) => setParam("unidade", v || null)} />
        <label className="field">
          <span>Situação da opção</span>
          <select value={situacao} onChange={(e) => setParam("situacao", e.target.value || null)}>
            <option value="">Todas</option>
            {SITUACOES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card flush secao="sme.inscricoes">
        {q.isLoading && <Spinner label="Buscando inscrições…" />}
        {q.isError && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={q.error} />
          </div>
        )}
        {q.data && q.data.items.length === 0 && <EmptyState title="Nenhuma inscrição neste recorte" />}
        {q.data && q.data.items.length > 0 && (
          <DataTable<Inscricao>
            rows={q.data.items}
            rowKey={(i) => i.id}
            onRowClick={(i) => navigate(`${base}/inscricoes/${i.id}`)}
            columns={[
              {
                key: "crianca",
                header: "Criança",
                render: (i) => (
                  <div>
                    <Link to={`${base}/inscricoes/${i.id}`}>
                      <strong>{i.aluno_anon}</strong>
                    </Link>
                    <div className="text-sm muted">
                      nascida em {i.nascimento_anomes ?? "—"} · {i.sexo === "F" ? "menina" : i.sexo === "M" ? "menino" : "—"}
                    </div>
                  </div>
                ),
              },
              { key: "ano", header: "Ano", render: (i) => i.ano, sortValue: (i) => i.ano },
              { key: "bairro", header: "Bairro", render: (i) => i.bairro ?? <span className="muted">não informado</span>, sortValue: (i) => i.bairro ?? "" },
              { key: "pont", header: "Pontos", numeric: true, render: (i) => i.pontuacao, sortValue: (i) => i.pontuacao },
              { key: "data", header: "Inscrita em", render: (i) => fmtDateTime(i.data_criacao), sortValue: (i) => i.data_criacao ?? "" },
              { key: "id", header: "Nº", numeric: true, render: (i) => `#${i.id}`, sortValue: (i) => i.id },
            ]}
            footer={
              <>
                <span>
                  {fmtInt(total)} inscrição(ões) · página {page} de {pages}
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
