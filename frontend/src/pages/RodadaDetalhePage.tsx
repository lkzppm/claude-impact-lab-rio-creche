import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { gerarConvocacoes, getAlocacoes, getExplicacao, getRodada } from "../api/client";
import type { Alocacao, Motivo, Proposta, Rodada, VagaMotivo } from "../api/types";
import {
  Page,
  Card,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  Button,
  Pill,
  TipoAlocacaoPill,
  Toast,
  fmtDateTime,
  fmtInt,
} from "../design-system";
import { UnidadeSelect } from "../components/Filters";
import { useToast } from "../components/useToast";
import { useBase } from "../areas/AreaContext";

const PAGE_SIZE = 50;

/** Resumo de uma rodada do motor: quantas crianças ficaram com vaga, em espera e sem opção viável. */
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

const STATUS_ALOC: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  alocada: { label: "Com vaga", tone: "ok" },
  lista_espera: { label: "Lista de espera", tone: "warn" },
  sem_opcao_viavel: { label: "Sem opção viável", tone: "danger" },
};

function resultadoTexto(p: Proposta): string {
  switch (p.resultado) {
    case "retida_provisoriamente":
      return "Reservada provisoriamente";
    case "rejeitada":
      return "Não entrou: as vagas foram para pontuação maior";
    case "desbancada":
      return "Perdeu a vaga para uma criança com prioridade maior";
    default:
      return p.resultado;
  }
}

function ListaPropostas({ itens }: { itens: Proposta[] }) {
  return (
    <ol className="steps">
      {itens.map((p, i) => (
        <li key={i} className={`step ${p.resultado}`}>
          <span className="step-n">{p.ordem}ª</span>
          <div>
            <strong>{p.unidade_nome ?? p.unidade}</strong>
            <div className="text-sm">
              {resultadoTexto(p)}
              {p.posicao != null && <> · posição {p.posicao}</>}
            </div>
            <div className="text-sm muted">
              {p.vagas != null && <>vagas: {fmtInt(p.vagas)} · </>}
              {p.corte != null ? <>última criança admitida tinha {p.corte} pontos</> : <>sem corte definido</>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PropostasAgrupadas({ motivo }: { motivo: Motivo }) {
  const propostas = motivo.propostas ?? [];
  const presas = motivo.presas ?? [];
  const selecionaveis = motivo.selecionaveis ?? [];
  if (propostas.length === 0 && presas.length === 0) {
    return <p className="muted text-sm">A inscrição não tinha opções válidas neste recorte.</p>;
  }
  const vaga = (v: VagaMotivo) => (
    <li key={`${v.unidade}-${v.ordem}`} className="step retida_provisoriamente">
      <span className="step-n">{v.ordem}ª</span>
      <div>
        <strong>{v.unidade_nome ?? v.unidade}</strong>
        <div className="text-sm">posição {v.posicao} na fila da unidade</div>
      </div>
    </li>
  );
  return (
    <div className="stack">
      <div>
        <div className="stat-label" style={{ marginBottom: 8 }}>Vagas reservadas</div>
        {presas.length === 0 ? <p className="muted text-sm">Nenhuma vaga reservada.</p> : <ol className="steps">{presas.map(vaga)}</ol>}
      </div>
      <div>
        <div className="stat-label" style={{ marginBottom: 8 }}>Alternativas na fila</div>
        {selecionaveis.length === 0 ? <p className="muted text-sm">Nenhuma alternativa na fila.</p> : <ol className="steps">{selecionaveis.map(vaga)}</ol>}
      </div>
      {propostas.length > 0 && (
        <div>
          <div className="stat-label" style={{ marginBottom: 8 }}>Passo a passo do motor</div>
          <ListaPropostas itens={propostas} />
        </div>
      )}
    </div>
  );
}

export default function RodadaDetalhePage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const qc = useQueryClient();
  const toast = useToast();
  const base = useBase();

  const [unidade, setUnidade] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selecionada, setSelecionada] = useState<Alocacao | null>(null);

  const rodada = useQuery({ queryKey: ["rodada", id], queryFn: () => getRodada(id), enabled: Number.isFinite(id) });
  const alocs = useQuery({
    queryKey: ["alocacoes", id, { unidade, status, page }],
    queryFn: () => getAlocacoes(id, { unidade: unidade || undefined, status: status || undefined, page, size: PAGE_SIZE }),
    enabled: Number.isFinite(id),
  });
  const explic = useQuery({
    queryKey: ["explicacao", id, selecionada?.inscricao_id],
    queryFn: () => getExplicacao(id, selecionada!.inscricao_id),
    enabled: !!selecionada,
  });

  const gerar = useMutation({
    mutationFn: () => gerarConvocacoes(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["convocacoes"] });
      qc.invalidateQueries({ queryKey: ["painel-resumo"] });
      qc.invalidateQueries({ queryKey: ["painel-unidades"] });
      toast.show(`${fmtInt(res.convocacoes_criadas)} convocações geradas${res.ja_existentes ? ` (${fmtInt(res.ja_existentes)} já existiam)` : ""}.`);
    },
    onError: (e) => toast.show(`Não deu para gerar: ${e instanceof Error ? e.message : String(e)}`),
  });

  const total = alocs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const r = rodada.data;
  const crumbs = [{ label: "Rede", to: base || "/" }, { label: `Classificação #${idParam}` }];

  return (
    <Page
      title={r ? `Classificação #${r.id} · ${r.ano}` : "Classificação"}
      subtitle={r ? `${r.parametros?.grupamento || "Todos os grupamentos"} · ${r.parametros?.horario || "Todos os turnos"} · feita pelo motor em ${fmtDateTime(r.criada_em)}` : undefined}
      crumbs={crumbs}
      actions={
        <Button variant="secondary" onClick={() => gerar.mutate()} disabled={gerar.isPending || !r} title="O motor já convoca sozinho a cada ciclo; use isto para não esperar o próximo.">
          {gerar.isPending ? "Gerando…" : "Convocar o que faltar"}
        </Button>
      }
    >
      {rodada.isLoading && <Spinner label="Abrindo a classificação…" />}
      {rodada.isError && <ErrorBox error={rodada.error} />}
      {r && (
        <Card title="Resultado">
          <ResumoRodada r={r} />
          {r.hash_entrada && (
            <p className="text-sm muted" style={{ marginTop: 12 }}>
              Identificador da entrada: <code>{r.hash_entrada.slice(0, 16)}…</code> — a mesma entrada produz sempre o mesmo resultado.
            </p>
          )}
        </Card>
      )}

      <div className="filters">
        <UnidadeSelect value={unidade} onChange={(v) => { setUnidade(v); setPage(1); setSelecionada(null); }} />
        <label className="field">
          <span>Resultado</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); setSelecionada(null); }}>
            <option value="">Todos</option>
            {Object.entries(STATUS_ALOC).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: selecionada ? "3fr 2fr" : "1fr" }}>
        <Card flush>
          {alocs.isLoading && <Spinner label="Carregando alocações…" />}
          {alocs.isError && (
            <div style={{ padding: 16 }}>
              <ErrorBox error={alocs.error} />
            </div>
          )}
          {alocs.data && alocs.data.items.length === 0 && <EmptyState title="Nenhuma alocação neste recorte" />}
          {alocs.data && alocs.data.items.length > 0 && (
            <DataTable<Alocacao>
              rows={alocs.data.items}
              rowKey={(a) => a.id}
              selectedKey={selecionada?.id ?? null}
              onRowClick={(a) => setSelecionada(a)}
              columns={[
                {
                  key: "crianca",
                  header: "Criança",
                  render: (a) => (
                    <div>
                      <strong>{a.aluno_anon ?? `inscrição #${a.inscricao_id}`}</strong>
                      <div className="text-sm muted">
                        {a.grupamento} · {a.horario}
                      </div>
                    </div>
                  ),
                },
                { key: "pont", header: "Pontos", numeric: true, render: (a) => a.pontuacao, sortValue: (a) => a.pontuacao },
                {
                  key: "status",
                  header: "Resultado",
                  render: (a) => {
                    const s = STATUS_ALOC[a.status] ?? { label: a.status, tone: "neutral" as const };
                    return <Pill tone={s.tone}>{s.label}</Pill>;
                  },
                },
                { key: "tipo", header: "Tipo", render: (a) => <TipoAlocacaoPill tipo={a.tipo} /> },
                {
                  key: "unidade",
                  header: "Unidade",
                  render: (a) => (a.unidade_nome ?? a.unidade_codigo ?? <span className="muted">—</span>),
                },
                {
                  key: "ordem",
                  header: "Opção",
                  numeric: true,
                  render: (a) => (a.motivo?.final ? `${a.motivo.final.ordem}ª` : "—"),
                  sortValue: (a) => a.motivo?.final?.ordem ?? 99,
                },
                { key: "pos", header: "Posição", numeric: true, render: (a) => a.posicao_fila ?? "—", sortValue: (a) => a.posicao_fila ?? 0 },
                {
                  key: "ficha",
                  header: "",
                  render: (a) => (
                    <Link to={`${base}/inscricoes/${a.inscricao_id}`} className="text-sm" onClick={(e) => e.stopPropagation()}>
                      ficha
                    </Link>
                  ),
                },
              ]}
              footer={
                <>
                  <span>
                    {fmtInt(total)} alocação(ões) · página {page} de {pages} · clique numa linha para ver o porquê
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

        {selecionada && (
          <Card
            title="Por que este resultado"
            className="side-panel"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setSelecionada(null)}>
                Fechar
              </Button>
            }
          >
            {explic.isLoading && <Spinner label="Montando a explicação…" />}
            {explic.isError && <ErrorBox error={explic.error} />}
            {explic.data && (
              <div className="stack">
                <p>{explic.data.texto}</p>
                <PropostasAgrupadas motivo={explic.data.motivo} />
                {explic.data.motivo.final && (
                  <div className="alert alert-ok">
                    Ficou em <strong>{explic.data.motivo.final.unidade_nome ?? explic.data.motivo.final.unidade}</strong> ({explic.data.motivo.final.ordem}ª opção), posição{" "}
                    {explic.data.motivo.final.posicao}.
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
      <Toast message={toast.message} />
    </Page>
  );
}
