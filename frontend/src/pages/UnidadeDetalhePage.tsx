import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getFilaUnidade, getUnidade, informarCapacidade } from "../api/client";
import type { Capacidade, FilaUnidadeItem } from "../api/types";
import { Page, Card, DataTable, Spinner, ErrorBox, EmptyState, Pill, Button, LinkButton, Toast, fmtInt } from "../design-system";
import { useArea } from "../areas/AreaContext";
import { useToast } from "../components/useToast";

const SITUACAO_FILA: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" }> = {
  aguardando: { label: "Pode ser convocada", tone: "ok" },
  convocada_aqui: { label: "Já convocada aqui", tone: "info" },
  confirmada_em_outra: { label: "Matriculada em outra unidade", tone: "neutral" },
  reservas_cheias: { label: "Já segura 3 reservas", tone: "warn" },
};

export default function UnidadeDetalhePage() {
  const { codigo = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const { base, area, ator } = useArea();
  const qc = useQueryClient();
  const toast = useToast();
  const grupamento = sp.get("grupamento") ?? "";
  const horario = sp.get("horario") ?? "";
  const [editando, setEditando] = useState<string | null>(null);
  const [vagas, setVagas] = useState<number>(0);

  const q = useQuery({ queryKey: ["unidade", codigo], queryFn: () => getUnidade(codigo), enabled: !!codigo });
  const fila = useQuery({
    queryKey: ["fila-unidade", codigo, { grupamento, horario }],
    queryFn: () => getFilaUnidade(codigo, { grupamento: grupamento || undefined, horario: horario || undefined }),
    enabled: !!codigo,
  });
  const salvar = useMutation({
    mutationFn: (c: Capacidade) => informarCapacidade(codigo, { ano: c.ano, grupamento: c.grupamento, horario: c.horario, vagas, ator: ator || undefined }),
    onSuccess: (c) => {
      setEditando(null);
      toast.show(`Capacidade de ${c.grupamento} · ${c.horario} (${c.ano}) registrada: ${fmtInt(c.vagas)} vagas informadas pela unidade.`);
      qc.invalidateQueries({ queryKey: ["unidade", codigo] });
      qc.invalidateQueries({ queryKey: ["painel-unidades"] });
    },
    onError: (e) => toast.show(`Não deu para salvar: ${e instanceof Error ? e.message : String(e)}`),
  });

  const u = q.data;
  const f = fila.data;
  const crumbs = [{ label: area === "sme" ? "Rede" : "Painel", to: base || "/" }, { label: "Unidades", to: `${base}/unidades` }, { label: u?.nome ?? codigo }];
  const endereco = u ? [u.logradouro, u.numero].filter(Boolean).join(", ") : "";

  function escolherGrupo(g: string, h: string) {
    const next = new URLSearchParams(sp);
    next.set("grupamento", g);
    next.set("horario", h);
    setSp(next, { replace: true });
  }

  return (
    <Page
      title={u?.nome ?? "Unidade"}
      subtitle={u ? [u.tipo, u.bairro, u.cre ? `${u.cre}ª CRE` : null].filter(Boolean).join(" · ") : undefined}
      crumbs={crumbs}
      actions={
        u && (
          <LinkButton to={`${base === "/sme" ? "/cre" : base}/convocacoes?fila=trabalho&unidade=${encodeURIComponent(u.codigo)}`} variant="secondary">
            Ver convocações
          </LinkButton>
        )
      }
    >
      {q.isLoading && <Spinner label="Abrindo a unidade…" />}
      {q.isError && <ErrorBox error={q.error} />}
      {u && (
        <>
          <Card title="Fila de espera" flush secao="cre.unidade_fila">
            <div style={{ padding: "12px 24px 0" }}>
              {fila.isLoading && <Spinner label="Carregando a fila…" />}
              {fila.isError && <ErrorBox error={fila.error} />}
              {f && f.grupos.length > 0 && (
                <div className="chips" style={{ marginBottom: 12 }}>
                  {f.grupos.map((g) => (
                    <button
                      key={`${g.grupamento}|${g.horario}`}
                      type="button"
                      className={`chip ${f.grupamento === g.grupamento && f.horario === g.horario ? "active" : ""}`}
                      onClick={() => escolherGrupo(g.grupamento, g.horario)}
                    >
                      {g.grupamento} · {g.horario}
                      <span className="chip-n">{fmtInt(g.n_fila)}</span>
                    </button>
                  ))}
                </div>
              )}
              {f && f.rodada_id && (
                <p className="text-sm muted" style={{ marginBottom: 12 }}>
                  Classificação #{f.rodada_id} · {fmtInt(f.n_reservadas)} vaga(s) reservada(s) · {fmtInt(f.n_convocadas_abertas)} convocação(ões) aberta(s) ·{" "}
                  {fmtInt(f.n_fila)} na fila. A ordem é a do motor: pontuação da resolução, depois os desempates.
                </p>
              )}
            </div>
            {f && !f.rodada_id && (
              <EmptyState title="Ainda sem classificação para esta unidade">
                <p>O motor classifica sozinho, a cada poucos minutos; assim que esta unidade entrar numa rodada, a fila aparece aqui.</p>
              </EmptyState>
            )}
            {f && f.rodada_id && f.itens.length === 0 && <EmptyState title="Ninguém na fila deste grupamento e turno" />}
            {f && f.itens.length > 0 && (
              <DataTable<FilaUnidadeItem>
                rows={f.itens}
                rowKey={(i) => i.alocacao_id}
                rowClass={(i) => (i.situacao === "aguardando" ? "row-ok" : undefined)}
                columns={[
                  { key: "pos", header: "Posição", numeric: true, render: (i) => <strong>{i.posicao_fila ?? "—"}</strong>, sortValue: (i) => i.posicao_fila ?? 0 },
                  {
                    key: "crianca",
                    header: "Criança",
                    render: (i) => <Link to={`${base}/inscricoes/${i.inscricao_id}`}>{i.aluno_anon ?? `inscrição #${i.inscricao_id}`}</Link>,
                  },
                  { key: "pts", header: "Pontos", numeric: true, render: (i) => i.pontuacao, sortValue: (i) => i.pontuacao },
                  { key: "ordem", header: "Opção da família", numeric: true, render: (i) => (i.ordem ? `${i.ordem}ª` : "—"), sortValue: (i) => i.ordem ?? 99 },
                  { key: "reservas", header: "Reservas abertas", numeric: true, render: (i) => fmtInt(i.reservas_abertas), sortValue: (i) => i.reservas_abertas },
                  {
                    key: "sit",
                    header: "Situação",
                    render: (i) => {
                      const s = SITUACAO_FILA[i.situacao] ?? { label: i.situacao, tone: "neutral" as const };
                      return <Pill tone={s.tone}>{s.label}</Pill>;
                    },
                  },
                ]}
                footer={
                  <span>
                    Linhas verdes podem receber a próxima vaga que abrir. Para convocar, abra a convocação recusada ou vencida e clique em "Convocar próximo da
                    fila".
                  </span>
                }
              />
            )}
          </Card>

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

            <Card title="Capacidade por grupamento e turno" flush secao={base === "/sme" ? "sme.unidade_capacidade" : "cre.unidade_capacidade"}>
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
                    {
                      key: "vagas",
                      header: "Vagas",
                      numeric: true,
                      render: (c) => {
                        const k = `${c.ano}-${c.grupamento}-${c.horario}`;
                        if (editando === k) {
                          return (
                            <span className="cap-form">
                              <input
                                type="number"
                                min={0}
                                max={10000}
                                value={vagas}
                                autoFocus
                                onChange={(e) => setVagas(Math.max(0, Number(e.target.value) || 0))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") salvar.mutate(c);
                                  if (e.key === "Escape") setEditando(null);
                                }}
                                aria-label="Vagas reais informadas pela unidade"
                              />
                              <Button size="sm" onClick={() => salvar.mutate(c)} disabled={salvar.isPending}>
                                Salvar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditando(null)} disabled={salvar.isPending}>
                                Cancelar
                              </Button>
                            </span>
                          );
                        }
                        return (
                          <span className="cap-form">
                            <span className="tabular">{fmtInt(c.vagas)}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditando(k);
                                setVagas(c.vagas);
                              }}
                              title="Informar as vagas reais desta turma"
                            >
                              corrigir
                            </Button>
                          </span>
                        );
                      },
                      sortValue: (c) => c.vagas,
                    },
                    {
                      key: "fonte",
                      header: "Origem",
                      render: (c) =>
                        c.fonte === "informada" ? <Pill tone="ok">Informada pela unidade</Pill> : <Pill tone="warn">Estimada (histórico)</Pill>,
                    },
                  ]}
                  footer={
                    <span>
                      "Estimada" = nº de matrículas confirmadas naquele ano; a base da SME traz ocupação, não vagas ofertadas. Clique em "corrigir" para
                      informar o número real — fica no histórico com data, hora e quem informou. O motor reclassifica sozinho no
                      ciclo seguinte, com a vaga corrigida.
                    </span>
                  }
                />
              )}
            </Card>
          </div>
        </>
      )}
      <Toast message={toast.message} />
    </Page>
  );
}
