import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPainelCres, getPainelResumo } from "../api/client";
import type { PainelCre } from "../api/types";
import {
  Page,
  Card,
  StatTile,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  Pill,
  StackedBar,
  Breakdown,
  BarList,
  Legenda,
  Hero,
  fmtInt,
  fmtDateTime,
  fmtHoras,
} from "../design-system";
import type { Segmento } from "../design-system";

export const LEGENDA_CRE = [
  { label: "Matrículas confirmadas", tone: "ok" as const, hint: "a família compareceu e a matrícula foi efetivada" },
  { label: "Abertas, no prazo", tone: "info" as const, hint: "a família ainda tem tempo para responder" },
  { label: "Vencidas", tone: "danger" as const, hint: "prazo passou sem resposta — vaga em risco" },
  { label: "Recusadas ou vencidas já registradas", tone: "neutral" as const, hint: "vagas que voltaram para a fila" },
];

export default function SmeRedePage() {
  const resumo = useQuery({ queryKey: ["painel-resumo", {}], queryFn: () => getPainelResumo(), refetchInterval: 60_000 });
  const cres = useQuery({ queryKey: ["painel-cres"], queryFn: () => getPainelCres(), refetchInterval: 60_000 });
  const r = resumo.data;
  const abertas = r?.selecionadas_aguardando.total ?? 0;

  const faixas: Segmento[] = r
    ? [
        { label: "Menos de 1 dia", value: r.selecionadas_aguardando.faixa_0_24h, tone: "ok", hint: "dentro do esperado" },
        { label: "1 a 2 dias", value: r.selecionadas_aguardando.faixa_24_48h, tone: "info", hint: "acompanhar" },
        { label: "2 a 3 dias", value: r.selecionadas_aguardando.faixa_48_72h, tone: "warn", hint: "prazo perto de vencer" },
        { label: "Mais de 3 dias", value: r.selecionadas_aguardando.faixa_mais_72h, tone: "danger", hint: "parada — agir agora" },
      ]
    : [];
  const desfechos: Segmento[] = r
    ? [
        { label: "Matrículas confirmadas", value: r.confirmadas ?? 0, tone: "ok", hint: "a família compareceu e a vaga foi ocupada" },
        { label: "Ainda abertas", value: abertas, tone: "info", hint: "sem desfecho — a família ainda pode responder" },
        { label: "Recusadas", value: r.recusadas ?? 0, tone: "warn", hint: "a vaga voltou para a fila" },
        { label: "Prazo vencido registrado", value: r.expiradas ?? 0, tone: "danger", hint: "a vaga voltou para a fila" },
      ]
    : [];

  const linhas = [...(cres.data ?? [])].sort((a, b) => b.em_atraso - a.em_atraso || Number(a.cre) - Number(b.cre));
  const maxConv = Math.max(1, ...linhas.map((c) => c.convocadas));

  return (
    <Page
      title="Visão da rede"
      subtitle="As 11 CREs em uma tela: onde a convocação está andando e onde está parada. Clique numa CRE para abrir o painel dela."
    >
      {resumo.isLoading && <Spinner label="Calculando o resumo…" />}
      {resumo.isError && <ErrorBox error={resumo.error} />}
      {r && (
        <>
          <div className="grid-2">
            <Card title="Há quanto tempo as convocações estão paradas">
              <Hero value={fmtInt(abertas)} label="convocações abertas na rede" hint={r.atualizado_em ? `atualizado ${fmtDateTime(r.atualizado_em)}` : undefined} />
              <StackedBar segmentos={faixas} ariaLabel="Convocações abertas por tempo na situação atual" />
            </Card>
            <Card title="Como as convocações estão terminando">
              <p className="text-sm muted" style={{ marginBottom: 12 }}>
                Cada convocação gerada nesta rodada está em uma destas quatro situações. Verde é matrícula fechada; laranja e vermelho
                devolveram a vaga para a fila.
              </p>
              <Breakdown segmentos={desfechos} ariaLabel="Convocações por desfecho" />
              {r.tempo_medio_ate_desfecho_h != null && (
                <div className="metricas-rodape">
                  <div className="metrica">
                    <span className="stat-label">Da seleção à resposta</span>
                    <span className="metrica-valor">{fmtHoras(r.tempo_medio_ate_desfecho_h)}</span>
                    <span className="stat-hint">média de {fmtInt(r.n_desfechos ?? 0)} desfechos — dado que hoje não existe na SME</span>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div className="grid-tiles">
            <StatTile label="Vencidas" value={fmtInt(r.vencidas ?? 0)} tone="danger" hint="prazo passou sem resposta" share={abertas ? (r.vencidas ?? 0) / abertas : 0} />
            <StatTile label="Sem aviso" value={fmtInt(r.sem_aviso ?? r.sem_contato)} tone="warn" hint="família ainda não foi avisada" share={abertas ? (r.sem_aviso ?? r.sem_contato) / abertas : 0} />
            <StatTile label="Aguardando a família" value={fmtInt(r.aguardando_familia ?? 0)} tone="info" hint="avisada, ainda não respondeu" share={abertas ? (r.aguardando_familia ?? 0) / abertas : 0} />
            <StatTile
              label="Vagas reservadas por criança"
              value={r.vagas_presas_por_crianca == null ? "—" : r.vagas_presas_por_crianca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
              tone="neutral"
              hint="média entre crianças com convocação aberta (máximo 3)"
              share={r.vagas_presas_por_crianca != null ? r.vagas_presas_por_crianca / 3 : undefined}
            />
            <StatTile label="Vagas liberadas hoje" value={fmtInt(r.vagas_liberadas_hoje ?? 0)} tone="ok" hint="voltaram para a fila" />
          </div>
        </>
      )}

      <Card title="Convocações por CRE">
        {cres.isLoading && <Spinner label="Carregando CREs…" />}
        {cres.isError && <ErrorBox error={cres.error} />}
        {cres.data && cres.data.length === 0 && (
          <EmptyState title="Ainda sem dados por CRE">
            <p>
              Rode uma classificação e gere convocações em <Link to="/sme/classificacao">Classificação</Link>.
            </p>
          </EmptyState>
        )}
        {linhas.length > 0 && (
          <>
            <p className="text-sm muted" style={{ marginBottom: 8 }}>
              Barras na mesma escala; ordenadas pela CRE com mais convocações vencidas.
            </p>
            <Legenda itens={LEGENDA_CRE} />
            <div className="viz-rows" style={{ marginTop: 12 }}>
              {linhas.map((c) => {
                const noPrazo = Math.max(0, c.abertas - c.em_atraso);
                const encerradasOutras = Math.max(0, c.convocadas - c.abertas - c.confirmadas);
                return (
                  <div className="viz-row" key={c.cre}>
                    <Link to={`/cre?cre=${encodeURIComponent(c.cre)}`} className="viz-row-label">
                      {c.cre}ª CRE
                    </Link>
                    <StackedBar
                      segmentos={[
                        { label: "Matrículas confirmadas", value: c.confirmadas, tone: "ok" },
                        { label: "Abertas, no prazo", value: noPrazo, tone: "info" },
                        { label: "Vencidas", value: c.em_atraso, tone: "danger" },
                        { label: "Recusadas ou vencidas já registradas", value: encerradasOutras, tone: "neutral" },
                      ]}
                      max={maxConv}
                      legenda={false}
                      rotulos={false}
                      altura={14}
                      ariaLabel={`${c.cre}ª CRE`}
                    />
                    <span className="viz-row-total" title="convocações geradas">
                      {fmtInt(c.convocadas)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-sm muted" style={{ marginTop: 8 }}>
              Em cinza: recusas e prazos vencidos já registrados (vagas que voltaram para a fila). Total à direita = convocações geradas.
            </p>
          </>
        )}
      </Card>

      {linhas.length > 0 && (
        <div className="grid-2">
          <Card title="Lista de espera por CRE">
            <p className="text-sm muted" style={{ marginBottom: 12 }}>
              Crianças sem vaga reservada, com posição na fila de alguma unidade da CRE.
            </p>
            <BarList
              itens={[...linhas]
                .sort((a, b) => b.lista_espera - a.lista_espera)
                .map((c) => ({ label: `${c.cre}ª CRE`, value: c.lista_espera, to: `/cre?cre=${encodeURIComponent(c.cre)}` }))}
            />
          </Card>
          <Card title="Vagas e inscrições por CRE">
            <p className="text-sm muted" style={{ marginBottom: 12 }}>
              Vagas estimadas (matrículas confirmadas no ano) contra inscrições de 1ª opção — onde a fila aperta.
            </p>
            <Legenda itens={[{ label: "Vagas estimadas", tone: "ok" }, { label: "Inscrições (1ª opção)", tone: "info" }]} />
            <div className="viz-rows" style={{ marginTop: 12 }}>
              {[...linhas]
                .sort((a, b) => Number(a.cre) - Number(b.cre))
                .map((c) => {
                  const maxi = Math.max(1, ...linhas.map((x) => Math.max(x.vagas, x.inscricoes)));
                  return (
                    <div className="viz-row" key={c.cre}>
                      <span className="viz-row-label">{c.cre}ª CRE</span>
                      <div className="stack" style={{ gap: 2 }}>
                        <StackedBar segmentos={[{ label: "Vagas estimadas", value: c.vagas, tone: "ok" }]} max={maxi} legenda={false} rotulos={false} altura={8} />
                        <StackedBar segmentos={[{ label: "Inscrições (1ª opção)", value: c.inscricoes, tone: "info" }]} max={maxi} legenda={false} rotulos={false} altura={8} />
                      </div>
                      <span className="viz-row-total" title="inscrições ÷ vagas">
                        {c.vagas > 0 ? `${(c.inscricoes / c.vagas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×` : "—"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      )}

      <Card title="Tabela por CRE" flush>
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
              { key: "alocadas", header: "Reservadas", numeric: true, render: (c) => fmtInt(c.alocadas), sortValue: (c) => c.alocadas },
              { key: "convocadas", header: "Convocadas", numeric: true, render: (c) => fmtInt(c.convocadas), sortValue: (c) => c.convocadas },
              { key: "abertas", header: "Abertas", numeric: true, render: (c) => fmtInt(c.abertas), sortValue: (c) => c.abertas },
              { key: "confirmadas", header: "Confirmadas", numeric: true, render: (c) => fmtInt(c.confirmadas), sortValue: (c) => c.confirmadas },
              {
                key: "em_atraso",
                header: "Vencidas",
                numeric: true,
                render: (c) => (c.em_atraso > 0 ? <Pill tone={c.em_atraso >= 50 ? "danger" : "warn"}>{fmtInt(c.em_atraso)}</Pill> : <span className="muted">0</span>),
                sortValue: (c) => c.em_atraso,
              },
              { key: "lista_espera", header: "Lista de espera", numeric: true, render: (c) => fmtInt(c.lista_espera), sortValue: (c) => c.lista_espera },
            ]}
            footer={<span>{cres.data.length} CRE(s) · a mesma informação dos gráficos, para conferir número a número</span>}
          />
        )}
      </Card>
    </Page>
  );
}
