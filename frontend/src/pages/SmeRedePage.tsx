import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPainelCres, getPainelResumo } from "../api/client";
import type { PainelCre } from "../api/types";
import { Page, Card, StatTile, DataTable, Spinner, ErrorBox, EmptyState, Pill, fmtInt, fmtDateTime } from "../design-system";

export default function SmeRedePage() {
  const resumo = useQuery({ queryKey: ["painel-resumo", {}], queryFn: () => getPainelResumo(), refetchInterval: 60_000 });
  const cres = useQuery({ queryKey: ["painel-cres"], queryFn: () => getPainelCres(), refetchInterval: 60_000 });
  const r = resumo.data;

  return (
    <Page
      title="Visão da rede"
      subtitle="As 11 CREs em uma tela: onde a convocação está andando e onde está parada. Clique em uma CRE para abrir o painel dela."
    >
      {resumo.isLoading && <Spinner label="Calculando o resumo…" />}
      {resumo.isError && <ErrorBox error={resumo.error} />}
      {r && (
        <>
          <div className="grid-tiles">
            <StatTile label="Aguardando resposta" value={fmtInt(r.selecionadas_aguardando.total)} tone="info" hint="vagas selecionadas em toda a rede" />
            <StatTile label="Há mais de 3 dias" value={fmtInt(r.selecionadas_aguardando.faixa_mais_72h)} tone="danger" hint="prazo vencido" />
            <StatTile label="Vagas em risco" value={fmtInt(r.vagas_em_risco)} tone="danger" hint="podem ficar ociosas" />
            <StatTile label="Famílias sem contato" value={fmtInt(r.sem_contato)} tone="warn" hint="nenhuma tentativa registrada" />
            {r.confirmadas != null && <StatTile label="Matrículas confirmadas" value={fmtInt(r.confirmadas)} tone="ok" />}
            <StatTile
              label="Vagas reservadas por criança"
              value={r.vagas_presas_por_crianca == null ? "—" : r.vagas_presas_por_crianca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
              tone="neutral"
              hint="média entre crianças com convocação aberta"
            />
            <StatTile label="Vagas liberadas hoje" value={fmtInt(r.vagas_liberadas_hoje ?? 0)} tone="ok" hint="voltaram para a fila" />
          </div>
          {r.atualizado_em && <p className="text-sm muted">Atualizado {fmtDateTime(r.atualizado_em)}</p>}
        </>
      )}

      <Card title="Por CRE" flush>
        {cres.isLoading && <Spinner label="Carregando CREs…" />}
        {cres.isError && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={cres.error} />
          </div>
        )}
        {cres.data && cres.data.length === 0 && (
          <EmptyState title="Ainda sem dados por CRE">
            <p>
              Rode uma classificação e gere convocações em <Link to="/sme/classificacao">Classificação</Link>.
            </p>
          </EmptyState>
        )}
        {cres.data && cres.data.length > 0 && (
          <DataTable<PainelCre>
            rows={cres.data}
            rowKey={(c) => c.cre}
            rowClass={(c) => (c.em_atraso > 0 ? (c.em_atraso >= 50 ? "row-danger" : "row-warn") : undefined)}
            columns={[
              {
                key: "cre",
                header: "CRE",
                render: (c) => <Link to={`/cre?cre=${encodeURIComponent(c.cre)}`}>{c.cre}ª CRE</Link>,
                sortValue: (c) => Number(c.cre) || 0,
              },
              { key: "unidades", header: "Unidades", numeric: true, render: (c) => fmtInt(c.unidades), sortValue: (c) => c.unidades },
              { key: "vagas", header: "Vagas", numeric: true, render: (c) => fmtInt(c.vagas), sortValue: (c) => c.vagas },
              { key: "inscricoes", header: "Inscrições", numeric: true, render: (c) => fmtInt(c.inscricoes), sortValue: (c) => c.inscricoes },
              { key: "alocadas", header: "Alocadas", numeric: true, render: (c) => fmtInt(c.alocadas), sortValue: (c) => c.alocadas },
              { key: "convocadas", header: "Convocadas", numeric: true, render: (c) => fmtInt(c.convocadas), sortValue: (c) => c.convocadas },
              { key: "abertas", header: "Abertas", numeric: true, render: (c) => fmtInt(c.abertas), sortValue: (c) => c.abertas },
              { key: "confirmadas", header: "Confirmadas", numeric: true, render: (c) => fmtInt(c.confirmadas), sortValue: (c) => c.confirmadas },
              {
                key: "em_atraso",
                header: "Em atraso",
                numeric: true,
                render: (c) => (c.em_atraso > 0 ? <Pill tone={c.em_atraso >= 50 ? "danger" : "warn"}>{fmtInt(c.em_atraso)}</Pill> : <span className="muted">0</span>),
                sortValue: (c) => c.em_atraso,
              },
              { key: "lista_espera", header: "Lista de espera", numeric: true, render: (c) => fmtInt(c.lista_espera), sortValue: (c) => c.lista_espera },
              {
                key: "acao",
                header: "",
                render: (c) => (
                  <Link to={`/cre?cre=${encodeURIComponent(c.cre)}`} className="text-sm">
                    abrir painel
                  </Link>
                ),
              },
            ]}
            footer={<span>{cres.data.length} CRE(s) · linhas com faixa colorida têm convocações em atraso</span>}
          />
        )}
      </Card>
    </Page>
  );
}
