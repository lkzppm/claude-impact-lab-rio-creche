import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getUnidade } from "../api/client";
import type { Capacidade } from "../api/types";
import { Page, Card, DataTable, Spinner, ErrorBox, EmptyState, Pill, LinkButton, fmtInt } from "../design-system";

export default function UnidadeDetalhePage() {
  const { codigo = "" } = useParams();
  const q = useQuery({ queryKey: ["unidade", codigo], queryFn: () => getUnidade(codigo), enabled: !!codigo });
  const u = q.data;
  const crumbs = [{ label: "Painel", to: "/" }, { label: "Unidades", to: "/unidades" }, { label: u?.nome ?? codigo }];

  const endereco = u ? [u.logradouro, u.numero].filter(Boolean).join(", ") : "";

  return (
    <Page
      title={u?.nome ?? "Unidade"}
      subtitle={u ? [u.tipo, u.bairro, u.cre ? `${u.cre}ª CRE` : null].filter(Boolean).join(" · ") : undefined}
      crumbs={crumbs}
      actions={
        u && (
          <LinkButton to={`/convocacoes?unidade=${encodeURIComponent(u.codigo)}`} variant="secondary">
            Ver convocações
          </LinkButton>
        )
      }
    >
      {q.isLoading && <Spinner label="Abrindo a unidade…" />}
      {q.isError && <ErrorBox error={q.error} />}
      {u && (
        <div className="grid-2">
          <Card title="Ficha">
            <dl className="dl">
              <dt>Código</dt>
              <dd>
                <code>{u.codigo}</code>
              </dd>
              <dt>Endereço</dt>
              <dd>{endereco || "—"}</dd>
              <dt>Bairro</dt>
              <dd>{u.bairro ?? "—"}</dd>
              <dt>CEP</dt>
              <dd>{u.cep ?? "—"}</dd>
              <dt>CRE</dt>
              <dd>{u.cre ? `${u.cre}ª CRE` : "—"}</dd>
              <dt>Polo</dt>
              <dd>{u.polo ?? "—"}</dd>
              <dt>Microárea</dt>
              <dd>{u.microarea ?? "—"}</dd>
              <dt>Localização</dt>
              <dd>
                {u.lat != null && u.lon != null ? (
                  <a href={`https://www.openstreetmap.org/?mlat=${u.lat}&mlon=${u.lon}#map=17/${u.lat}/${u.lon}`} target="_blank" rel="noreferrer">
                    {u.lat.toFixed(5)}, {u.lon.toFixed(5)} (abrir mapa)
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
          </Card>

          <Card title="Capacidade por grupamento e turno" flush>
            {u.capacidade.length === 0 ? (
              <EmptyState title="Sem capacidade registrada">
                <p>Rode a carga inicial dos dados para estimar a capacidade a partir das confirmações históricas.</p>
              </EmptyState>
            ) : (
              <DataTable<Capacidade>
                rows={u.capacidade}
                rowKey={(c) => `${c.ano}-${c.grupamento}-${c.horario}`}
                columns={[
                  { key: "ano", header: "Ano", render: (c) => c.ano, sortValue: (c) => c.ano },
                  { key: "grup", header: "Grupamento", render: (c) => c.grupamento, sortValue: (c) => c.grupamento },
                  { key: "hor", header: "Turno", render: (c) => c.horario, sortValue: (c) => c.horario },
                  { key: "vagas", header: "Vagas", numeric: true, render: (c) => fmtInt(c.vagas), sortValue: (c) => c.vagas },
                  {
                    key: "fonte",
                    header: "Origem",
                    render: (c) =>
                      c.fonte === "informada" ? <Pill tone="ok">Informada pela unidade</Pill> : <Pill tone="warn">Estimada (histórico)</Pill>,
                  },
                ]}
                footer={
                  <span>
                    Capacidade "estimada" = nº de matrículas confirmadas naquele ano. A base da SME traz ocupação, não vagas ofertadas.{" "}
                    <Link to="/classificacao">Rodar classificação</Link>
                  </span>
                }
              />
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}
