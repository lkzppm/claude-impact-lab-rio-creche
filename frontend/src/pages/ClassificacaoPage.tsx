import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { criarRodada, gerarConvocacoes, getProcessos, getRodadas } from "../api/client";
import type { Rodada } from "../api/types";
import {
  Page,
  Card,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  Button,
  Pill,
  Toast,
  BarList,
  fmtDateTime,
  fmtInt,
} from "../design-system";
import { GRUPAMENTOS, HORARIOS } from "../components/Filters";
import { useToast } from "../components/useToast";
import { useBase } from "../areas/AreaContext";

export function ResumoRodada({ r }: { r: Rodada }) {
  const s = r.resumo;
  if (!s) return <p className="muted text-sm">Sem resumo.</p>;
  const ordens = Object.entries(s.por_ordem_da_opcao ?? {}).sort(([a], [b]) => Number(a) - Number(b));
  const max = Math.max(1, ...ordens.map(([, v]) => v));
  return (
    <div className="stack">
      <div className="grid-tiles">
        <div>
          <div className="stat-label">Inscrições</div>
          <div className="stat-value" style={{ fontSize: 24 }}>{fmtInt(s.n_inscricoes)}</div>
        </div>
        <div>
          <div className="stat-label">Com vaga</div>
          <div className="stat-value" style={{ fontSize: 24, color: "var(--ok)" }}>{fmtInt(s.n_alocadas)}</div>
        </div>
        <div>
          <div className="stat-label">Lista de espera</div>
          <div className="stat-value" style={{ fontSize: 24, color: "var(--warn)" }}>{fmtInt(s.n_lista_espera)}</div>
        </div>
        <div>
          <div className="stat-label">Sem opção viável</div>
          <div className="stat-value" style={{ fontSize: 24, color: "var(--danger)" }}>{fmtInt(s.n_sem_opcao)}</div>
        </div>
      </div>
      {(s.n_criancas_com_alguma_presa != null || s.media_presas_por_crianca != null) && (
        <div className="grid-tiles">
          {s.n_criancas_com_alguma_presa != null && (
            <div>
              <div className="stat-label">Crianças com vaga reservada</div>
              <div className="stat-value" style={{ fontSize: 24 }}>{fmtInt(s.n_criancas_com_alguma_presa)}</div>
            </div>
          )}
          {s.media_presas_por_crianca != null && (
            <div>
              <div className="stat-label">Vagas reservadas por criança (média)</div>
              <div className="stat-value" style={{ fontSize: 24 }}>{s.media_presas_por_crianca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div>
            </div>
          )}
        </div>
      )}
      {ordens.length > 0 && (
        <div>
          <div className="stat-label" style={{ marginBottom: 8 }}>Vaga obtida em qual opção da família</div>
          <div className="bars">
            {ordens.map(([ordem, v]) => (
              <div className="bar-row" key={ordem}>
                <span>{ordem}ª opção</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(v / max) * 100}%` }} />
                </div>
                <span className="tabular" style={{ textAlign: "right" }}>{fmtInt(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClassificacaoPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const base = useBase();

  const processos = useQuery({ queryKey: ["processos"], queryFn: getProcessos });
  const rodadas = useQuery({ queryKey: ["rodadas"], queryFn: getRodadas });

  // rodadas do mesmo ano/grupamento/turno com regimes diferentes (vagas_presas) — para comparar lado a lado
  const comparacoes = (() => {
    const grupos = new Map<string, Rodada[]>();
    for (const r of rodadas.data ?? []) {
      if (r.tipo !== "inicial") continue;
      const k = `${r.ano}|${r.parametros?.grupamento ?? "todos"}|${r.parametros?.horario ?? "todos"}`;
      grupos.set(k, [...(grupos.get(k) ?? []), r]);
    }
    return [...grupos.entries()]
      .map(([k, rs]) => {
        const porRegime = new Map<number, Rodada>();
        for (const r of rs) porRegime.set(r.parametros?.vagas_presas ?? 1, r); // fica a mais recente de cada regime
        return { chave: k, rodadas: [...porRegime.values()].sort((a, b) => (a.parametros?.vagas_presas ?? 1) - (b.parametros?.vagas_presas ?? 1)) };
      })
      .filter((g) => g.rodadas.length > 1);
  })();

  const [ano, setAno] = useState<string>("");
  const [grupamento, setGrupamento] = useState("");
  const [horario, setHorario] = useState("");
  const [vagasPresas, setVagasPresas] = useState(3);
  const [alternativas, setAlternativas] = useState(2);
  const anoEfetivo = ano || (processos.data && processos.data.length ? String(processos.data[processos.data.length - 1].ano) : "");

  const criar = useMutation({
    mutationFn: () =>
      criarRodada({
        ano: Number(anoEfetivo),
        grupamento: grupamento || null,
        horario: horario || null,
        tipo: "inicial",
        vagas_presas: vagasPresas,
        alternativas,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["rodadas"] });
      toast.show(`Classificação concluída: ${fmtInt(r.resumo?.n_alocadas ?? 0)} crianças com vaga.`);
      navigate(`${base}/classificacao/${r.id}`);
    },
    onError: (e) => toast.show(`A classificação falhou: ${e instanceof Error ? e.message : String(e)}`),
  });

  const gerar = useMutation({
    mutationFn: (rodadaId: number) => gerarConvocacoes(rodadaId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["convocacoes"] });
      qc.invalidateQueries({ queryKey: ["painel-resumo"] });
      qc.invalidateQueries({ queryKey: ["painel-unidades"] });
      toast.show(`${fmtInt(res.convocacoes_criadas)} convocações geradas${res.ja_existentes ? ` (${fmtInt(res.ja_existentes)} já existiam)` : ""}.`);
    },
    onError: (e) => toast.show(`Não deu para gerar: ${e instanceof Error ? e.message : String(e)}`),
  });

  return (
    <Page
      title="Classificação por criança"
      subtitle="O motor lê a pontuação vigente e a ordem de preferência de cada família e resolve a fila inteira de uma vez, em memória. Cada criança recebe até 3 vagas reservadas nas unidades mais preferidas em que a pontuação alcança, mais 2 alternativas na fila — e a cascata de liberações roda aqui, não no calendário. Com 1 vaga reservada, é o Deferred Acceptance clássico."
    >
      <Card title="Rodar uma nova classificação">
        <div className="filters" style={{ marginBottom: 0 }}>
          <label className="field">
            <span>Ano do processo</span>
            <select value={anoEfetivo} onChange={(e) => setAno(e.target.value)} disabled={processos.isLoading}>
              {(processos.data ?? []).map((p) => (
                <option key={p.ano} value={p.ano}>
                  {p.ano}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Grupamento</span>
            <select value={grupamento} onChange={(e) => setGrupamento(e.target.value)}>
              <option value="">Todos</option>
              {GRUPAMENTOS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Turno</span>
            <select value={horario} onChange={(e) => setHorario(e.target.value)}>
              <option value="">Todos</option>
              {HORARIOS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span>Vagas reservadas</span>
            <input type="number" min={1} max={5} value={vagasPresas} onChange={(e) => setVagasPresas(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span>Alternativas</span>
            <input type="number" min={0} max={4} value={alternativas} onChange={(e) => setAlternativas(Math.max(0, Math.min(4, Number(e.target.value) || 0)))} />
          </label>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending || !anoEfetivo}>
            {criar.isPending ? "Classificando…" : "Rodar classificação"}
          </Button>
        </div>
        {processos.isError && <div style={{ marginTop: 12 }}><ErrorBox error={processos.error} /></div>}
        <p className="text-sm muted" style={{ marginTop: 12 }}>
          <strong>{vagasPresas} vaga{vagasPresas === 1 ? "" : "s"} reservada{vagasPresas === 1 ? "" : "s"} por criança + {alternativas} alternativa{alternativas === 1 ? "" : "s"} na fila.</strong>{" "}
          Vaga reservada = a criança tem a vaga garantida na unidade até responder; alternativa = só uma posição na fila, sem vaga presa.
        </p>
        <p className="text-sm muted" style={{ marginTop: 8 }}>
          A pontuação é a da resolução do ano escolhido; o motor não altera pesos nem prioridades. A capacidade por unidade é estimada a
          partir das confirmações históricas e está marcada como tal.
        </p>
      </Card>

      {comparacoes.length > 0 && (
        <Card title="Comparar regimes" secao="sme.classificacao_comparar">
          <p className="text-sm muted" style={{ marginBottom: 12 }}>
            Mesmo ano, grupamento e turno, classificados com números diferentes de vagas reservadas por criança. Quanto mais
            reservas simultâneas, menos crianças distintas recebem oferta na primeira rodada.
          </p>
          <div className="stack">
            {comparacoes.map((g) => {
              const [ano, grup, hor] = g.chave.split("|");
              return (
                <div key={g.chave}>
                  <div className="stat-label" style={{ marginBottom: 6 }}>
                    {ano} · {grup} · {hor}
                  </div>
                  <div className="grid-2" style={{ marginBottom: 12 }}>
                    <div>
                      <div className="text-sm muted" style={{ marginBottom: 6 }}>Crianças com oferta na 1ª rodada</div>
                      <BarList
                        tone="ok"
                        itens={g.rodadas.map((r) => ({
                          label: `${r.parametros?.vagas_presas ?? 1} reserva(s)`,
                          value: r.resumo?.n_criancas_com_alguma_presa ?? r.resumo?.n_alocadas ?? 0,
                          to: `${base}/classificacao/${r.id}`,
                        }))}
                      />
                    </div>
                    <div>
                      <div className="text-sm muted" style={{ marginBottom: 6 }}>Crianças em lista de espera</div>
                      <BarList
                        tone="warn"
                        itens={g.rodadas.map((r) => ({
                          label: `${r.parametros?.vagas_presas ?? 1} reserva(s)`,
                          value: r.resumo?.n_lista_espera ?? 0,
                          to: `${base}/classificacao/${r.id}`,
                        }))}
                      />
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Regime</th>
                          <th className="num">Crianças com oferta</th>
                          <th className="num">Média de reservas</th>
                          <th className="num">Lista de espera</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rodadas.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.parametros?.vagas_presas ?? 1}</strong> vaga(s) reservada(s) + {r.parametros?.alternativas ?? 0} alternativa(s)
                            </td>
                            <td className="num">{fmtInt(r.resumo?.n_criancas_com_alguma_presa ?? r.resumo?.n_alocadas)}</td>
                            <td className="num">{r.resumo?.media_presas_por_crianca?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"}</td>
                            <td className="num">{fmtInt(r.resumo?.n_lista_espera)}</td>
                            <td>
                              <Link to={`${base}/classificacao/${r.id}`} className="text-sm">
                                ver #{r.id}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Classificações já feitas" flush secao="sme.classificacao_rodadas">
        {rodadas.isLoading && <Spinner label="Carregando…" />}
        {rodadas.isError && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={rodadas.error} />
          </div>
        )}
        {rodadas.data && rodadas.data.length === 0 && (
          <EmptyState title="Nenhuma classificação ainda">
            <p>Escolha o ano acima e clique em "Rodar classificação".</p>
          </EmptyState>
        )}
        {rodadas.data && rodadas.data.length > 0 && (
          <DataTable<Rodada>
            rows={[...rodadas.data].sort((a, b) => b.id - a.id)}
            rowKey={(r) => r.id}
            columns={[
              { key: "id", header: "#", render: (r) => <Link to={`${base}/classificacao/${r.id}`}>#{r.id}</Link>, sortValue: (r) => r.id },
              { key: "ano", header: "Ano", render: (r) => r.ano, sortValue: (r) => r.ano },
              {
                key: "recorte",
                header: "Recorte",
                render: (r) => (
                  <span>
                    {r.parametros?.grupamento || "Todos os grupamentos"} · {r.parametros?.horario || "Todos os turnos"}
                    {(r.parametros?.vagas_presas != null || r.parametros?.alternativas != null) && (
                      <div className="text-sm muted">
                        {r.parametros?.vagas_presas ?? 3} reservada(s) + {r.parametros?.alternativas ?? 2} alternativa(s)
                      </div>
                    )}
                  </span>
                ),
              },
              { key: "tipo", header: "Tipo", render: (r) => <Pill tone={r.tipo === "rematch" ? "info" : "neutral"}>{r.tipo === "rematch" ? "Reaproveitamento" : "Inicial"}</Pill> },
              { key: "quando", header: "Quando", render: (r) => fmtDateTime(r.criada_em), sortValue: (r) => r.criada_em },
              { key: "insc", header: "Inscrições", numeric: true, render: (r) => fmtInt(r.resumo?.n_inscricoes), sortValue: (r) => r.resumo?.n_inscricoes ?? 0 },
              { key: "aloc", header: "Com vaga", numeric: true, render: (r) => fmtInt(r.resumo?.n_alocadas), sortValue: (r) => r.resumo?.n_alocadas ?? 0 },
              { key: "espera", header: "Lista de espera", numeric: true, render: (r) => fmtInt(r.resumo?.n_lista_espera), sortValue: (r) => r.resumo?.n_lista_espera ?? 0 },
              {
                key: "acoes",
                header: "",
                render: (r) => (
                  <span className="row">
                    <Link to={`${base}/classificacao/${r.id}`} className="text-sm">
                      ver alocações
                    </Link>
                    <Button variant="secondary" size="sm" onClick={() => gerar.mutate(r.id)} disabled={gerar.isPending}>
                      Gerar convocações
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Toast message={toast.message} />
    </Page>
  );
}
