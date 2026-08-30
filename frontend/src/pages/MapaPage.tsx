import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { getMapa } from "../api/client";
import type { MapaUnidade } from "../api/types";
import {
  Page,
  Card,
  StatTile,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  Button,
  Meter,
  Pill,
  fmtInt,
  fmtDateTime,
} from "../design-system";
import MapaTerritorio, { METRICAS } from "../components/MapaTerritorio";
import type { Territorio } from "../components/MapaTerritorio";
import { useArea } from "../areas/AreaContext";

const soma = (xs: Territorio[], campo: keyof Territorio) => xs.reduce((a, x) => a + (x[campo] ?? 0), 0);

export default function MapaPage() {
  const { area, base, cre: creContexto } = useArea();
  const [sp, setSp] = useSearchParams();
  const naCre = area === "cre";
  const creSel = naCre ? creContexto : sp.get("cre") ?? "";
  const unidadeSel = sp.get("u") ?? "";
  const [metricaKey, setMetricaKey] = useState(METRICAS[0].key);
  const [busca, setBusca] = useState("");
  const metrica = METRICAS.find((m) => m.key === metricaKey) ?? METRICAS[0];

  const mapa = useQuery({
    queryKey: ["mapa", { cre: creSel || undefined }],
    queryFn: () => getMapa({ cre: creSel || undefined }),
    refetchInterval: 60_000,
    enabled: !naCre || !!creSel,
  });

  const navegar = (cre: string, unidade?: string) => {
    const n = new URLSearchParams(sp);
    if (cre) n.set("cre", cre);
    else n.delete("cre");
    if (unidade) n.set("u", unidade);
    else n.delete("u");
    setSp(n);
  };

  if (naCre && !creSel) {
    return (
      <Page title="Mapa do território" subtitle="Escolha a sua CRE no menu azul para ver as creches no mapa.">
        <EmptyState title="Nenhuma CRE escolhida">
          <p>O mapa mostra as creches e EDIs da sua CRE, com vagas, fila e convocações vencidas.</p>
        </EmptyState>
      </Page>
    );
  }

  const d = mapa.data;
  const nivel: "rede" | "cre" = creSel ? "cre" : "rede";
  const cres = d?.cres ?? [];
  const unidades = d?.unidades ?? [];
  const creAtual = cres.find((c) => c.cre === creSel);
  const unidade = unidades.find((u) => u.codigo === unidadeSel) ?? null;

  const itens: (Territorio & { chave: string; rotulo: string; sub?: string })[] =
    nivel === "rede"
      ? [...cres].map((c) => ({ ...c, chave: c.cre, rotulo: `${c.cre}ª CRE`, sub: `${fmtInt(c.unidades)} unidades` }))
      : unidades
          .filter((u) => !busca || (u.nome ?? u.codigo).toLowerCase().includes(busca.toLowerCase()) || (u.bairro ?? "").toLowerCase().includes(busca.toLowerCase()))
          .map((u) => ({ ...u, chave: u.codigo, rotulo: u.nome ?? u.codigo, sub: u.bairro ?? undefined }));
  const ordenados = [...itens].sort((a, b) => metrica.valor(b) - metrica.valor(a));
  const maxMetrica = Math.max(1e-9, ...ordenados.map((i) => metrica.valor(i)));
  const totais = nivel === "rede" ? cres : unidades;

  const crumbs = naCre
    ? [{ label: `${creSel}ª CRE` }, ...(unidade ? [{ label: unidade.nome ?? unidade.codigo }] : [])]
    : [
        { label: "Rede", to: nivel === "rede" ? undefined : `${base}/mapa` },
        ...(creSel ? [{ label: `${creSel}ª CRE`, to: unidade ? `${base}/mapa?cre=${encodeURIComponent(creSel)}` : undefined }] : []),
        ...(unidade ? [{ label: unidade.nome ?? unidade.codigo }] : []),
      ];

  return (
    <Page
      title={nivel === "rede" ? "Mapa da rede" : `Mapa da ${creSel}ª CRE`}
      subtitle={
        nivel === "rede"
          ? "Onde a fila aperta, no território. Clique numa CRE — no mapa ou na lista — para abrir todas as creches dela."
          : "Todas as creches e EDIs da CRE, com vagas, fila e convocações. Clique numa unidade para ver os números e abrir a fila dela."
      }
      crumbs={crumbs}
      actions={
        !naCre && nivel === "cre" ? (
          <Button variant="secondary" onClick={() => navegar("")}>
            ← Voltar para a rede
          </Button>
        ) : undefined
      }
    >
      {!naCre && (
        <div className="filters" style={{ marginBottom: 0 }}>
          <label className="field">
            <span>Território</span>
            <select value={creSel} onChange={(e) => navegar(e.target.value)}>
              <option value="">Rede — todas as CREs</option>
              {cres.map((c) => (
                <option key={c.cre} value={c.cre}>
                  {c.cre}ª CRE
                </option>
              ))}
            </select>
          </label>
          {nivel === "cre" && (
            <span className="text-sm muted" style={{ alignSelf: "center" }}>
              Você está na {creSel}ª CRE — volte para "Rede — todas as CREs" para ver o município inteiro.
            </span>
          )}
        </div>
      )}

      <div className="chips" role="group" aria-label="O que mostrar no mapa">
        {METRICAS.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`chip ${m.key === metricaKey ? "active" : ""}`}
            onClick={() => setMetricaKey(m.key)}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mapa.isLoading && <Spinner label="Carregando o mapa…" />}
      {mapa.isError && <ErrorBox error={mapa.error} />}

      {d && (
        <>
          <div className="grid-tiles">
            <StatTile label={nivel === "rede" ? "CREs" : "Unidades"} value={fmtInt(nivel === "rede" ? cres.length : unidades.length)} tone="neutral" hint={nivel === "rede" ? "coordenadorias regionais" : "creches e EDIs da CRE"} />
            <StatTile label="Vagas estimadas" value={fmtInt(soma(totais, "vagas"))} tone="info" hint={`processo ${d.ano ?? "—"}`} />
            <StatTile label="Inscrições (1ª opção)" value={fmtInt(soma(totais, "inscricoes"))} tone="neutral" hint="famílias que escolheram uma unidade daqui em primeiro lugar" />
            <StatTile label="Lista de espera" value={fmtInt(soma(totais, "lista_espera"))} tone="warn" hint="crianças sem vaga reservada" />
            <StatTile label="Convocações vencidas" value={fmtInt(soma(totais, "em_atraso"))} tone="danger" hint="prazo passou sem resposta" />
          </div>

          <Card title={metrica.label} actions={<span className="text-sm muted">{metrica.hint}</span>}>
            <div className="mapa-drill">
              <MapaTerritorio
                nivel={nivel}
                cres={cres}
                unidades={unidades}
                metrica={metrica}
                unidadeSelecionada={unidadeSel || null}
                onCre={(c) => navegar(c)}
                onUnidade={(u) => navegar(creSel, u)}
              />
              <aside className="mapa-aside">
                {nivel === "cre" && (
                  <label className="field">
                    <span>Procurar creche</span>
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome ou bairro" />
                  </label>
                )}
                <div className="stat-label">{nivel === "rede" ? "CREs, da maior para a menor" : `${fmtInt(ordenados.length)} unidade(s)`}</div>
                <ul className="mapa-lista">
                  {ordenados.map((i) => (
                    <li key={i.chave}>
                      <button
                        type="button"
                        className={`mapa-item ${i.chave === unidadeSel ? "ativo" : ""}`}
                        onClick={() => (nivel === "rede" ? navegar(i.chave) : navegar(creSel, i.chave))}
                      >
                        <span className="mapa-item-nome">
                          {i.rotulo}
                          {i.sub && <small>{i.sub}</small>}
                        </span>
                        <span className="mapa-item-valor">{metrica.formato(i)}</span>
                        <Meter share={metrica.valor(i) / maxMetrica} tone={metrica.tom(i)} label={`${i.rotulo}: ${metrica.formato(i)}`} />
                      </button>
                    </li>
                  ))}
                  {ordenados.length === 0 && <li className="muted text-sm">Nada neste recorte.</li>}
                </ul>
              </aside>
            </div>
            <p className="text-sm muted" style={{ marginTop: 12 }}>
              Atualizado {fmtDateTime(d.atualizado_em)} · vagas e fila saem da última classificação do motor.
            </p>
          </Card>

          {unidade && (
            <Card
              title={unidade.nome ?? unidade.codigo}
              actions={
                <span className="row" style={{ alignItems: "center", gap: 12 }}>
                  <Link to={`${base}/unidades/${encodeURIComponent(unidade.codigo)}`} className="text-sm">
                    ver a unidade
                  </Link>
                  <Link to={`${base}/convocacoes?fila=trabalho&unidade=${encodeURIComponent(unidade.codigo)}`} className="text-sm">
                    ver convocações
                  </Link>
                  <Button variant="secondary" size="sm" onClick={() => navegar(creSel)}>
                    ← Voltar para a {creSel}ª CRE
                  </Button>
                </span>
              }
            >
              <p className="text-sm muted" style={{ marginBottom: 12 }}>
                {unidade.tipo ?? "Unidade"} · {unidade.bairro ?? "bairro não informado"} · {unidade.cre}ª CRE
              </p>
              <div className="grid-tiles">
                <StatTile label="Vagas estimadas" value={fmtInt(unidade.vagas)} tone="info" />
                <StatTile label="Inscrições (1ª opção)" value={fmtInt(unidade.inscricoes)} tone="neutral" share={unidade.vagas ? Math.min(1, unidade.inscricoes / unidade.vagas) : undefined} hint={unidade.vagas ? `${(unidade.inscricoes / unidade.vagas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por vaga` : undefined} />
                <StatTile label="Vagas reservadas" value={fmtInt(unidade.alocadas)} tone="ok" />
                <StatTile label="Lista de espera" value={fmtInt(unidade.lista_espera)} tone="warn" />
                <StatTile label="Matrículas confirmadas" value={fmtInt(unidade.confirmadas)} tone="ok" />
                <StatTile label="Convocações vencidas" value={fmtInt(unidade.em_atraso)} tone="danger" share={unidade.convocadas ? unidade.em_atraso / unidade.convocadas : undefined} />
              </div>
            </Card>
          )}

          {nivel === "cre" && unidades.length > 0 && (
            <Card title="Todas as creches da CRE" flush>
              <DataTable<MapaUnidade>
                rows={unidades}
                rowKey={(u) => u.codigo}
                selectedKey={unidadeSel || null}
                onRowClick={(u) => navegar(creSel, u.codigo)}
                rowClass={(u) => (u.em_atraso > 0 ? (u.em_atraso >= 10 ? "row-danger" : "row-warn") : undefined)}
                columns={[
                  {
                    key: "nome",
                    header: "Unidade",
                    render: (u) => (
                      <div>
                        <Link to={`${base}/unidades/${encodeURIComponent(u.codigo)}`}>{u.nome ?? u.codigo}</Link>
                        <div className="text-sm muted">{u.bairro ?? "—"}</div>
                      </div>
                    ),
                    sortValue: (u) => u.nome ?? u.codigo,
                  },
                  { key: "vagas", header: "Vagas", numeric: true, render: (u) => fmtInt(u.vagas), sortValue: (u) => u.vagas },
                  { key: "inscricoes", header: "Inscrições", numeric: true, render: (u) => fmtInt(u.inscricoes), sortValue: (u) => u.inscricoes },
                  {
                    key: "pressao",
                    header: "Por vaga",
                    numeric: true,
                    render: (u) => (u.vagas > 0 ? `${(u.inscricoes / u.vagas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×` : "—"),
                    sortValue: (u) => (u.vagas > 0 ? u.inscricoes / u.vagas : 0),
                  },
                  { key: "alocadas", header: "Reservadas", numeric: true, render: (u) => fmtInt(u.alocadas), sortValue: (u) => u.alocadas },
                  { key: "espera", header: "Lista de espera", numeric: true, render: (u) => fmtInt(u.lista_espera), sortValue: (u) => u.lista_espera },
                  { key: "convocadas", header: "Convocadas", numeric: true, render: (u) => fmtInt(u.convocadas), sortValue: (u) => u.convocadas },
                  { key: "confirmadas", header: "Confirmadas", numeric: true, render: (u) => fmtInt(u.confirmadas), sortValue: (u) => u.confirmadas },
                  {
                    key: "em_atraso",
                    header: "Vencidas",
                    numeric: true,
                    render: (u) => (u.em_atraso > 0 ? <Pill tone={u.em_atraso >= 10 ? "danger" : "warn"}>{fmtInt(u.em_atraso)}</Pill> : <span className="muted">0</span>),
                    sortValue: (u) => u.em_atraso,
                  },
                ]}
                footer={
                  <span>
                    {unidades.length} unidade(s) da {creSel}ª CRE · inclusive as que ainda não têm convocação nenhuma
                  </span>
                }
              />
            </Card>
          )}

          {nivel === "rede" && creAtual == null && cres.length === 0 && (
            <EmptyState title="Ainda sem unidades carregadas">
              <p>Rode a carga das bases da SME (`make load`) para o mapa aparecer.</p>
            </EmptyState>
          )}
        </>
      )}
    </Page>
  );
}
