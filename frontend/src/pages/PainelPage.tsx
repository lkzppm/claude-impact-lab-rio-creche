import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPainelResumo, getPainelUnidades } from "../api/client";
import type { PainelUnidade } from "../api/types";
import {
  Page,
  Card,
  StatTile,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  fmtInt,
  fmtDateTime,
  Pill,
} from "../design-system";
import { UnidadeSelect } from "../components/Filters";
import { useArea } from "../areas/AreaContext";

export default function PainelPage() {
  const { cre, base } = useArea();
  const [unidade, setUnidade] = useState("");

  const resumo = useQuery({
    queryKey: ["painel-resumo", { cre, unidade }],
    queryFn: () => getPainelResumo({ cre: cre || undefined, unidade: unidade || undefined }),
    refetchInterval: 60_000,
  });
  const unidades = useQuery({
    queryKey: ["painel-unidades", { cre }],
    queryFn: () => getPainelUnidades({ cre: cre || undefined }),
    refetchInterval: 60_000,
  });

  const r = resumo.data;
  const linhas = (unidades.data ?? []).filter((u) => !unidade || u.unidade_codigo === unidade);

  return (
    <Page
      title={cre ? `Painel da ${cre}ª CRE` : "Painel da CRE / polo"}
      subtitle="Cada vaga selecionada tem um relógio. Aqui você vê, por unidade e por criança, o que está parado e o que precisa de ação hoje."
    >
      {!cre && (
        <div className="alert alert-info">
          <strong>Escolha a sua CRE</strong> no menu azul acima para ver só o seu território. Sem CRE escolhida, o painel mostra a rede inteira.
        </div>
      )}
      <div className="filters">
        <UnidadeSelect value={unidade} onChange={setUnidade} cre={cre} />
        {r?.atualizado_em && (
          <span className="text-sm muted" style={{ alignSelf: "center" }}>
            Atualizado {fmtDateTime(r.atualizado_em)}
          </span>
        )}
      </div>

      {resumo.isLoading && <Spinner label="Calculando o resumo…" />}
      {resumo.isError && <ErrorBox error={resumo.error} />}
      {r && (
        <>
          <div className="grid-tiles">
            <StatTile
              label="Aguardando resposta"
              value={fmtInt(r.selecionadas_aguardando.total)}
              hint="vagas selecionadas que ainda não viraram matrícula"
              tone="info"
            />
            <StatTile label="Há menos de 1 dia" value={fmtInt(r.selecionadas_aguardando.faixa_0_24h)} tone="ok" hint="dentro do esperado" />
            <StatTile label="Entre 1 e 2 dias" value={fmtInt(r.selecionadas_aguardando.faixa_24_48h)} tone="ok" hint="acompanhar" />
            <StatTile label="Entre 2 e 3 dias" value={fmtInt(r.selecionadas_aguardando.faixa_48_72h)} tone="warn" hint="prazo perto de vencer" />
            <StatTile label="Há mais de 3 dias" value={fmtInt(r.selecionadas_aguardando.faixa_mais_72h)} tone="danger" hint="prazo vencido — agir agora" />
          </div>
          <div className="grid-tiles">
            <StatTile label="Vagas em risco" value={fmtInt(r.vagas_em_risco)} tone="danger" hint="podem ficar ociosas se ninguém agir" />
            <StatTile label="Famílias sem contato" value={fmtInt(r.sem_contato)} tone="warn" hint="nenhuma tentativa registrada ainda" />
            <StatTile label="Inconsistências" value={fmtInt(r.inconsistencias)} tone="warn" hint="cadastros com mais de uma opção ativa" />
            {r.confirmadas != null && (
              <StatTile label="Matrículas confirmadas" value={fmtInt(r.confirmadas)} tone="ok" hint="no recorte selecionado" />
            )}
            <StatTile
              label="Vagas reservadas por criança"
              value={r.vagas_presas_por_crianca == null ? "—" : r.vagas_presas_por_crianca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
              tone="neutral"
              hint="média entre as crianças com convocação aberta"
            />
            <StatTile label="Vagas liberadas hoje" value={fmtInt(r.vagas_liberadas_hoje ?? 0)} tone="ok" hint="voltaram para a fila após confirmação em outra unidade" />
          </div>
        </>
      )}

      <Card title="Por unidade" flush>
        {unidades.isLoading && <Spinner label="Carregando unidades…" />}
        {unidades.isError && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={unidades.error} />
          </div>
        )}
        {unidades.data && linhas.length === 0 && (
          <EmptyState title="Nenhuma unidade neste recorte">
            <p>Troque a CRE no menu ou o filtro de unidade.</p>
          </EmptyState>
        )}
        {unidades.data && linhas.length > 0 && (
          <DataTable<PainelUnidade>
            rows={linhas}
            rowKey={(u) => u.unidade_codigo}
            rowClass={(u) => (u.em_atraso > 0 ? (u.em_atraso >= 3 ? "row-danger" : "row-warn") : undefined)}
            columns={[
              {
                key: "unidade",
                header: "Unidade",
                render: (u) => (
                  <div>
                    <Link to={`${base}/unidades/${encodeURIComponent(u.unidade_codigo)}`}>{u.unidade_nome}</Link>
                    {u.cre && <div className="text-sm muted">{u.cre}ª CRE</div>}
                  </div>
                ),
                sortValue: (u) => u.unidade_nome,
              },
              { key: "vagas", header: "Vagas", numeric: true, render: (u) => fmtInt(u.vagas), sortValue: (u) => u.vagas },
              { key: "alocadas", header: "Alocadas", numeric: true, render: (u) => fmtInt(u.alocadas), sortValue: (u) => u.alocadas },
              { key: "convocadas", header: "Convocadas", numeric: true, render: (u) => fmtInt(u.convocadas), sortValue: (u) => u.convocadas },
              { key: "confirmadas", header: "Confirmadas", numeric: true, render: (u) => fmtInt(u.confirmadas), sortValue: (u) => u.confirmadas },
              {
                key: "em_atraso",
                header: "Em atraso",
                numeric: true,
                render: (u) =>
                  u.em_atraso > 0 ? <Pill tone={u.em_atraso >= 3 ? "danger" : "warn"}>{fmtInt(u.em_atraso)}</Pill> : <span className="muted">0</span>,
                sortValue: (u) => u.em_atraso,
              },
              {
                key: "acao",
                header: "",
                render: (u) => (
                  <Link to={`${base}/convocacoes?unidade=${encodeURIComponent(u.unidade_codigo)}`} className="text-sm">
                    ver convocações
                  </Link>
                ),
              },
            ]}
            footer={<span>{linhas.length} unidade(s) · linhas com faixa colorida têm convocações em atraso</span>}
          />
        )}
      </Card>
    </Page>
  );
}
