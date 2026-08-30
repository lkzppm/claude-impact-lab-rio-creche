import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { gerarConvocacoes, getAlocacoes, getExplicacao, getRodada } from "../api/client";
import type { Alocacao, Proposta } from "../api/types";
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
import { ResumoRodada } from "./ClassificacaoPage";
import { useToast } from "../components/useToast";

const PAGE_SIZE = 50;

const STATUS_ALOC: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  alocada: { label: "Com vaga", tone: "ok" },
  lista_espera: { label: "Lista de espera", tone: "warn" },
  sem_opcao_viavel: { label: "Sem opção viável", tone: "danger" },
};

function resultadoTexto(p: Proposta): string {
  switch (p.resultado) {
    case "aceita":
      return "Ficou com a vaga";
    case "retida":
      return "Reservada provisoriamente";
    case "rejeitada":
      return "Não entrou";
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

function PropostasAgrupadas({ propostas }: { propostas: Proposta[] }) {
  if (propostas.length === 0) {
    return <p className="muted text-sm">A inscrição não tinha opções válidas neste recorte.</p>;
  }
  const temTipo = propostas.some((p) => p.tipo);
  if (!temTipo) {
    return (
      <div>
        <div className="stat-label" style={{ marginBottom: 8 }}>Passo a passo do motor</div>
        <ListaPropostas itens={propostas} />
      </div>
    );
  }
  const presas = propostas.filter((p) => p.tipo === "presa");
  const selecionaveis = propostas.filter((p) => p.tipo === "selecionavel");
  const outras = propostas.filter((p) => !p.tipo);
  return (
    <div className="stack">
      <div>
        <div className="stat-label" style={{ marginBottom: 8 }}>Vagas reservadas (até 3)</div>
        {presas.length === 0 ? <p className="muted text-sm">Nenhuma vaga reservada.</p> : <ListaPropostas itens={presas} />}
      </div>
      <div>
        <div className="stat-label" style={{ marginBottom: 8 }}>Alternativas na fila (até 2)</div>
        {selecionaveis.length === 0 ? <p className="muted text-sm">Nenhuma alternativa na fila.</p> : <ListaPropostas itens={selecionaveis} />}
      </div>
      {outras.length > 0 && (
        <div>
          <div className="stat-label" style={{ marginBottom: 8 }}>Opções não atendidas</div>
          <ListaPropostas itens={outras} />
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
      toast.show(`${fmtInt(res.n_convocacoes)} convocações geradas.`);
    },
    onError: (e) => toast.show(`Não deu para gerar: ${e instanceof Error ? e.message : String(e)}`),
  });

  const total = alocs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const r = rodada.data;
  const crumbs = [{ label: "Painel", to: "/" }, { label: "Classificação", to: "/classificacao" }, { label: `#${idParam}` }];

  return (
    <Page
      title={r ? `Classificação #${r.id} · ${r.ano}` : "Classificação"}
      subtitle={r ? `${r.parametros?.grupamento || "Todos os grupamentos"} · ${r.parametros?.horario || "Todos os turnos"} · feita em ${fmtDateTime(r.criada_em)}` : undefined}
      crumbs={crumbs}
      actions={
        <Button onClick={() => gerar.mutate()} disabled={gerar.isPending || !r}>
          {gerar.isPending ? "Gerando…" : "Gerar convocações"}
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
                    <Link to={`/inscricoes/${a.inscricao_id}`} className="text-sm" onClick={(e) => e.stopPropagation()}>
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
                <PropostasAgrupadas propostas={explic.data.motivo.propostas} />
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
