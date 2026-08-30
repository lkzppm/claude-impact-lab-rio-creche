import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { expirarVencidas, getConvocacoes, getPainelResumo, getPainelUnidades } from "../api/client";
import type { Convocacao, PainelUnidade } from "../api/types";
import {
  Page,
  Card,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  Button,
  ConfirmDialog,
  Toast,
  StatusPill,
  Pill,
  StackedBar,
  Breakdown,
  BarList,
  Meter,
  Hero,
  Donut,
  fmtInt,
  fmtDateTime,
  fmtHoras,
  fmtQuando,
  prazoTexto,
} from "../design-system";
import type { Fatia, Segmento } from "../design-system";
import { UnidadeSelect, CRES } from "../components/Filters";
import MotorCard from "../components/MotorCard";
import { useArea } from "../areas/AreaContext";
import { useToast } from "../components/useToast";

/** Primeiro acesso: o servidor escolhe a CRE uma vez (fica salva neste navegador). */
function EscolherCre() {
  const { setCre } = useArea();
  return (
    <Page
      title="Qual é a sua CRE?"
      subtitle="Escolha uma vez — fica salvo neste computador. Dá para trocar no menu azul a qualquer momento."
    >
      <ul className="cre-grid">
        {CRES.map((c) => (
          <li key={c}>
            <button type="button" className="cre-card" onClick={() => setCre(c)}>
              {c}ª<small>CRE</small>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm muted">
        Cada creche e EDI pertence a uma das 11 Coordenadorias Regionais de Educação. Em dúvida, procure a unidade escolar.
      </p>
    </Page>
  );
}

export default function PainelPage() {
  const { cre, base, ator } = useArea();
  const [unidade, setUnidade] = useState("");
  const [confirmarExpirar, setConfirmarExpirar] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const resumo = useQuery({
    queryKey: ["painel-resumo", { cre, unidade }],
    queryFn: () => getPainelResumo({ cre: cre || undefined, unidade: unidade || undefined }),
    refetchInterval: 60_000,
    enabled: !!cre,
  });
  const unidades = useQuery({
    queryKey: ["painel-unidades", { cre }],
    queryFn: () => getPainelUnidades({ cre: cre || undefined }),
    refetchInterval: 60_000,
    enabled: !!cre,
  });
  const trabalho = useQuery({
    queryKey: ["convocacoes", { cre, unidade, fila: "trabalho", size: 8 }],
    queryFn: () => getConvocacoes({ cre: cre || undefined, unidade: unidade || undefined, fila: "trabalho", size: 8 }),
    refetchInterval: 60_000,
    enabled: !!cre,
  });

  const expirar = useMutation({
    mutationFn: () => expirarVencidas({ cre: cre || undefined, unidade: unidade || undefined, ator: ator || undefined }),
    onSuccess: (res) => {
      setConfirmarExpirar(false);
      toast.show(
        res.expiradas === 0
          ? "Nenhuma convocação vencida neste recorte."
          : `${fmtInt(res.expiradas)} convocação(ões) registrada(s) como prazo vencido. As vagas voltaram para a fila.`,
      );
      qc.invalidateQueries({ queryKey: ["painel-resumo"] });
      qc.invalidateQueries({ queryKey: ["painel-unidades"] });
      qc.invalidateQueries({ queryKey: ["convocacoes"] });
    },
    onError: (e) => toast.show(`Não deu para registrar: ${e instanceof Error ? e.message : String(e)}`),
  });

  if (!cre) return <EscolherCre />;

  const r = resumo.data;
  const linhas = (unidades.data ?? []).filter((u) => !unidade || u.unidade_codigo === unidade);
  const lista = (fila: string) => `${base}/convocacoes?fila=${fila}${unidade ? `&unidade=${encodeURIComponent(unidade)}` : ""}`;
  const porStatus = (status: string) => `${base}/convocacoes?status=${status}${unidade ? `&unidade=${encodeURIComponent(unidade)}` : ""}`;
  const vencidas = r?.vencidas ?? 0;
  const abertas = r?.selecionadas_aguardando.total ?? 0;
  const faixas: Segmento[] = r
    ? [
        { label: "Menos de 1 dia", value: r.selecionadas_aguardando.faixa_0_24h, tone: "ok", hint: "dentro do esperado" },
        { label: "1 a 2 dias", value: r.selecionadas_aguardando.faixa_24_48h, tone: "info", hint: "acompanhar" },
        { label: "2 a 3 dias", value: r.selecionadas_aguardando.faixa_48_72h, tone: "warn", hint: "prazo perto de vencer" },
        { label: "Mais de 3 dias", value: r.selecionadas_aguardando.faixa_mais_72h, tone: "danger", hint: "parada — agir agora" },
      ]
    : [];
  const desfechos: Fatia[] = r
    ? [
        { label: "Matrículas confirmadas", value: r.confirmadas ?? 0, tone: "ok", hint: "a família compareceu e a vaga foi ocupada", to: porStatus("confirmada") },
        { label: "Ainda abertas", value: abertas, tone: "info", hint: "sem desfecho — a família ainda pode responder", to: lista("abertas") },
        { label: "Recusadas", value: r.recusadas ?? 0, tone: "neutral", hint: "a vaga voltou para a fila", to: porStatus("recusada") },
        { label: "Prazo vencido registrado", value: r.expiradas ?? 0, tone: "danger", hint: "a vaga voltou para a fila", to: porStatus("expirada") },
      ]
    : [];
  const maisVencidas = [...linhas].filter((u) => u.em_atraso > 0).sort((a, b) => b.em_atraso - a.em_atraso).slice(0, 8);
  // urgência das convocações abertas: fatias que não se sobrepõem (cada convocação está em uma só)
  const noPrazo = Math.max(0, abertas - vencidas - (r?.vencem_24h ?? 0));
  const urgencia: Fatia[] = r
    ? [
        { label: "Vencidas", value: vencidas, tone: "danger", hint: "prazo passou sem resposta — registrar desfecho ou avisar", to: lista("vencidas") },
        { label: "Vencem em 24 h", value: r.vencem_24h ?? 0, tone: "warn", hint: "último dia para a família responder", to: lista("vencem_24h") },
        { label: "No prazo", value: noPrazo, tone: "ok", hint: "a família ainda tem mais de um dia", to: lista("abertas") },
      ]
    : [];

  return (
    <Page
      title={`Painel da ${cre}ª CRE`}
      subtitle="Cada vaga selecionada tem um relógio. Aqui você vê o que está parado e o que precisa de ação hoje — clique num número para abrir a lista."
    >
      <div className="filters">
        <UnidadeSelect value={unidade} onChange={setUnidade} cre={cre} />
        {r?.atualizado_em && (
          <span className="text-sm muted" style={{ alignSelf: "center" }}>
            Atualizado {fmtDateTime(r.atualizado_em)}
          </span>
        )}
      </div>

      <MotorCard compacto />

      {resumo.isLoading && <Spinner label="Calculando o resumo…" />}
      {resumo.isError && <ErrorBox error={resumo.error} />}

      {r && (
        <Card
          secao="cre.para_hoje"
          title={`Para hoje${unidade ? " · nesta unidade" : ""}`}
          actions={
            vencidas > 0 && (
              <Button variant="danger" size="sm" onClick={() => setConfirmarExpirar(true)} disabled={expirar.isPending}>
                Registrar as {fmtInt(vencidas)} vencidas
              </Button>
            )
          }
        >
          <div className="para-hoje">
            <Donut
              fatias={urgencia}
              centro={fmtInt(abertas)}
              centroLabel="abertas"
              ariaLabel="Convocações abertas por urgência"
              onFatia={(f) => f.to && navigate(f.to)}
            />
            <div className="para-hoje-lado">
              <p className="text-sm muted">
                Cada fatia é uma parte das convocações abertas. Clique na fatia ou no nome para abrir a lista, da mais urgente para a menos.
              </p>
              <p className="text-sm">
                <strong>{fmtInt(r.sem_aviso ?? r.sem_contato)}</strong> famílias ainda não foram avisadas ·{" "}
                <Link to={lista("sem_aviso")}>ver lista →</Link>
              </p>
              <p className="text-sm">
                <strong>{fmtInt(r.criancas_multireserva ?? 0)}</strong> crianças seguram mais de uma vaga ·{" "}
                <Link to={`${base}/multireserva${unidade ? `?unidade=${encodeURIComponent(unidade)}` : ""}`}>ver lista →</Link>
              </p>
            </div>
          </div>

          <div style={{ marginTop: 16 }} data-secao="cre.fila_trabalho">
            <div className="stat-label" style={{ marginBottom: 8 }}>
              Fila de trabalho · da mais urgente para a menos
            </div>
            {trabalho.isLoading && <Spinner label="Montando a fila…" />}
            {trabalho.isError && <ErrorBox error={trabalho.error} />}
            {trabalho.data && trabalho.data.items.length === 0 && (
              <p className="muted text-sm">Nenhuma convocação aberta neste recorte. O motor gera as convocações sozinho — assim que sair uma, ela aparece aqui.</p>
            )}
            {trabalho.data && trabalho.data.items.length > 0 && (
              <>
                <ul className="trabalho">
                  {trabalho.data.items.map((c: Convocacao) => (
                    <li key={c.id}>
                      <div>
                        <Link to={`${base}/convocacoes/${c.id}`}>
                          <strong>{c.aluno_anon ?? `inscrição #${c.inscricao_id}`}</strong>
                        </Link>
                        <div className="text-sm muted">
                          {c.unidade_nome ?? c.unidade_codigo} · {c.grupamento} · {c.horario}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <StatusPill status={c.status} />
                        <span className="text-sm tabular" title={c.prazo_fim ? fmtQuando(c.prazo_fim) : undefined}>
                          {prazoTexto(c.prazo_fim)}
                        </span>
                      </div>
                      <div className="trabalho-acao">
                        <strong>{c.proxima_acao ?? "—"}</strong>
                        {(c.n_tentativas ?? 0) > 0 && <span> · {c.n_tentativas} tentativa(s)</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-sm" style={{ marginTop: 8 }}>
                  <Link to={lista("trabalho")}>Ver toda a fila ({fmtInt(trabalho.data.total)}) →</Link>
                </p>
              </>
            )}
          </div>
        </Card>
      )}

      {r && (
        <>
          <Card title="Há quanto tempo as convocações estão paradas" secao="cre.tempo_paradas">
            <Hero value={fmtInt(abertas)} label="convocações abertas" hint="cada barra é uma parte do total; passe o mouse para ver o detalhe" />
            <StackedBar segmentos={faixas} ariaLabel="Convocações abertas por tempo na situação atual" />
            <p className="text-sm" style={{ marginTop: 12 }}>
              <Link to={lista("abertas")}>Ver todas as abertas →</Link>
            </p>
          </Card>
          <Card title="Como as convocações estão terminando" secao="cre.desfechos">
            <p className="text-sm muted" style={{ marginBottom: 12 }}>
              Cada convocação gerada está em uma destas quatro situações. Clique no nome para abrir a lista.
            </p>
            <Breakdown segmentos={desfechos} ariaLabel="Convocações por desfecho" />
            <div className="metricas-rodape">
              <div className="metrica">
                <span className="stat-label">Tempo até o desfecho</span>
                <span className="metrica-valor">{r.tempo_medio_ate_desfecho_h == null ? "—" : fmtHoras(r.tempo_medio_ate_desfecho_h)}</span>
                <span className="stat-hint">média de {fmtInt(r.n_desfechos ?? 0)} desfecho(s)</span>
              </div>
              <div className="metrica">
                <span className="stat-label">Liberadas hoje</span>
                <span className="metrica-valor">{fmtInt(r.vagas_liberadas_hoje ?? 0)}</span>
                <span className="stat-hint">voltaram para a fila</span>
              </div>
              <div className="metrica">
                <span className="stat-label">Reservas por criança</span>
                <span className="metrica-valor">
                  {r.vagas_presas_por_crianca == null ? "—" : r.vagas_presas_por_crianca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                </span>
                <span className="stat-hint">média, de no máximo 3</span>
                <Meter share={r.vagas_presas_por_crianca != null ? r.vagas_presas_por_crianca / 3 : 0} tone="neutral" label="média de reservas, de 1 a 3" />
              </div>
              {r.inconsistencias > 0 && (
                <div className="metrica">
                  <span className="stat-label">Inconsistências</span>
                  <span className="metrica-valor danger">{fmtInt(r.inconsistencias)}</span>
                  <span className="stat-hint">matriculada e ainda com reserva aberta</span>
                </div>
              )}
            </div>
          </Card>

          {maisVencidas.length > 0 && (
            <Card title="Unidades com mais convocações vencidas" secao="cre.unidades_vencidas">
              <p className="text-sm muted" style={{ marginBottom: 12 }}>
                Comece por aqui: são as vagas que podem ficar ociosas. Clique na unidade para abrir a fila dela.
              </p>
              <BarList
                tone="danger"
                itens={maisVencidas.map((u) => ({
                  label: u.unidade_nome,
                  value: u.em_atraso,
                  to: `${base}/convocacoes?fila=vencidas&unidade=${encodeURIComponent(u.unidade_codigo)}`,
                  hint: `${fmtInt(u.em_atraso)} vencida(s) de ${fmtInt(u.convocadas)} convocação(ões)`,
                }))}
              />
            </Card>
          )}
        </>
      )}

      <Card title="Por unidade" flush secao="cre.por_unidade">
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
              { key: "alocadas", header: "Reservadas", numeric: true, render: (u) => fmtInt(u.alocadas), sortValue: (u) => u.alocadas },
              { key: "convocadas", header: "Convocadas", numeric: true, render: (u) => fmtInt(u.convocadas), sortValue: (u) => u.convocadas },
              { key: "confirmadas", header: "Confirmadas", numeric: true, render: (u) => fmtInt(u.confirmadas), sortValue: (u) => u.confirmadas },
              {
                key: "liberadas",
                header: "Liberadas",
                numeric: true,
                render: (u) => ((u.liberadas ?? 0) > 0 ? <Pill tone="ok">{fmtInt(u.liberadas)}</Pill> : <span className="muted">0</span>),
                sortValue: (u) => u.liberadas ?? 0,
              },
              {
                key: "em_atraso",
                header: "Vencidas",
                numeric: true,
                render: (u) =>
                  u.em_atraso > 0 ? (
                    <div style={{ minWidth: 90 }}>
                      <Pill tone={u.em_atraso >= 3 ? "danger" : "warn"}>{fmtInt(u.em_atraso)}</Pill>
                      <Meter share={u.convocadas ? u.em_atraso / u.convocadas : 0} tone="danger" label="parte das convocações da unidade que venceu" />
                    </div>
                  ) : (
                    <span className="muted">0</span>
                  ),
                sortValue: (u) => u.em_atraso,
              },
              {
                key: "acao",
                header: "",
                render: (u) => (
                  <Link to={`${base}/convocacoes?fila=trabalho&unidade=${encodeURIComponent(u.unidade_codigo)}`} className="text-sm">
                    ver convocações
                  </Link>
                ),
              },
            ]}
            footer={<span>{linhas.length} unidade(s) · linhas com faixa colorida têm convocações vencidas</span>}
          />
        )}
      </Card>

      <ConfirmDialog
        open={confirmarExpirar}
        title={`Registrar prazo vencido em ${fmtInt(vencidas)} convocação(ões)?`}
        description={`Todas as convocações abertas ${unidade ? "desta unidade" : `da ${cre}ª CRE`} com prazo já passado recebem o evento "Prazo vencido", com data, hora e ${
          ator ? `o nome "${ator}"` : "quem registrou"
        }. As vagas voltam para a fila. Não dá para desfazer — o histórico é permanente.`}
        confirmLabel="Sim, registrar"
        danger
        busy={expirar.isPending}
        onCancel={() => setConfirmarExpirar(false)}
        onConfirm={() => expirar.mutate()}
      />
      <Toast message={toast.message} />
    </Page>
  );
}
