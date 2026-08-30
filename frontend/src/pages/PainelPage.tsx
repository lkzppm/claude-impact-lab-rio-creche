import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { expirarVencidas, getConvocacoes, getPainelResumo, getPainelUnidades } from "../api/client";
import type { Convocacao, PainelUnidade } from "../api/types";
import {
  Page,
  Card,
  StatTile,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  Button,
  ConfirmDialog,
  Toast,
  StatusPill,
  Pill,
  fmtInt,
  fmtDateTime,
  fmtHoras,
  fmtQuando,
  prazoTexto,
} from "../design-system";
import { UnidadeSelect, CRES } from "../components/Filters";
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
  const vencidas = r?.vencidas ?? 0;

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

      {resumo.isLoading && <Spinner label="Calculando o resumo…" />}
      {resumo.isError && <ErrorBox error={resumo.error} />}

      {r && (
        <Card
          title={`Para hoje${unidade ? " · nesta unidade" : ""}`}
          actions={
            vencidas > 0 && (
              <Button variant="danger" size="sm" onClick={() => setConfirmarExpirar(true)} disabled={expirar.isPending}>
                Registrar as {fmtInt(vencidas)} vencidas
              </Button>
            )
          }
        >
          <div className="grid-tiles">
            <StatTile label="Vencidas" value={fmtInt(vencidas)} tone={vencidas > 0 ? "danger" : "ok"} hint="prazo passou sem resposta" to={lista("vencidas")} />
            <StatTile label="Vencem em 24 h" value={fmtInt(r.vencem_24h ?? 0)} tone="warn" hint="último dia para a família responder" to={lista("vencem_24h")} />
            <StatTile label="Sem aviso" value={fmtInt(r.sem_aviso ?? r.sem_contato)} tone="warn" hint="família ainda não foi avisada" to={lista("sem_aviso")} />
            <StatTile
              label="Várias reservas"
              value={fmtInt(r.criancas_multireserva ?? 0)}
              tone="info"
              hint="crianças segurando mais de uma vaga"
              to={`${base}/multireserva${unidade ? `?unidade=${encodeURIComponent(unidade)}` : ""}`}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="stat-label" style={{ marginBottom: 8 }}>
              Fila de trabalho · da mais urgente para a menos
            </div>
            {trabalho.isLoading && <Spinner label="Montando a fila…" />}
            {trabalho.isError && <ErrorBox error={trabalho.error} />}
            {trabalho.data && trabalho.data.items.length === 0 && (
              <p className="muted text-sm">Nenhuma convocação aberta neste recorte. Quando o Nível Central gerar convocações, elas aparecem aqui.</p>
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
          <div className="grid-tiles">
            <StatTile
              label="Aguardando resposta"
              value={fmtInt(r.selecionadas_aguardando.total)}
              hint="vagas selecionadas que ainda não viraram matrícula"
              tone="info"
              to={lista("abertas")}
            />
            <StatTile label="Há menos de 1 dia" value={fmtInt(r.selecionadas_aguardando.faixa_0_24h)} tone="ok" hint="dentro do esperado" />
            <StatTile label="Entre 1 e 2 dias" value={fmtInt(r.selecionadas_aguardando.faixa_24_48h)} tone="ok" hint="acompanhar" />
            <StatTile label="Entre 2 e 3 dias" value={fmtInt(r.selecionadas_aguardando.faixa_48_72h)} tone="warn" hint="prazo perto de vencer" />
            <StatTile label="Há mais de 3 dias" value={fmtInt(r.selecionadas_aguardando.faixa_mais_72h)} tone="danger" hint="parado — agir agora" />
          </div>
          <div className="grid-tiles">
            <StatTile label="Vagas em risco" value={fmtInt(r.vagas_em_risco)} tone="danger" hint="vencidas ou paradas há mais de 3 dias" to={lista("vencidas")} />
            <StatTile label="Aguardando a família" value={fmtInt(r.aguardando_familia ?? 0)} tone="info" hint="avisada, ainda não respondeu" to={lista("aguardando")} />
            <StatTile label="Inconsistências" value={fmtInt(r.inconsistencias)} tone="warn" hint="matriculada e ainda com reserva aberta" />
            {r.confirmadas != null && <StatTile label="Matrículas confirmadas" value={fmtInt(r.confirmadas)} tone="ok" hint="no recorte selecionado" />}
            <StatTile
              label="Vagas reservadas por criança"
              value={r.vagas_presas_por_crianca == null ? "—" : r.vagas_presas_por_crianca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
              tone="neutral"
              hint="média entre as crianças com convocação aberta"
            />
            <StatTile label="Vagas liberadas hoje" value={fmtInt(r.vagas_liberadas_hoje ?? 0)} tone="ok" hint="voltaram para a fila após confirmação, recusa ou prazo" />
            <StatTile
              label="Tempo até o desfecho"
              value={r.tempo_medio_ate_desfecho_h == null ? "—" : fmtHoras(r.tempo_medio_ate_desfecho_h)}
              tone="neutral"
              hint={`média de ${fmtInt(r.n_desfechos ?? 0)} desfecho(s) · dado que hoje não existe na SME`}
            />
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
                  u.em_atraso > 0 ? <Pill tone={u.em_atraso >= 3 ? "danger" : "warn"}>{fmtInt(u.em_atraso)}</Pill> : <span className="muted">0</span>,
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
