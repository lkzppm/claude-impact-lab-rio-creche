import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getConvocacao, registrarEvento } from "../api/client";
import type { EventoTipo } from "../api/types";
import {
  Page,
  Card,
  Spinner,
  ErrorBox,
  EmptyState,
  StatusPill,
  STATUS_ENCERRADOS,
  Button,
  ConfirmDialog,
  Toast,
  fmtDateTime,
  fmtHoras,
  prazoTexto,
} from "../design-system";
import { useToast } from "../components/useToast";
import { useBase } from "../areas/AreaContext";

interface Acao {
  tipo: EventoTipo;
  label: string;
  titulo: string;
  descricao: string;
  variant: "primary" | "secondary" | "danger";
  withNote?: boolean;
  /** estados em que a ação faz sentido */
  quando: string[];
}

const ACOES: Acao[] = [
  {
    tipo: "tentativa_contato",
    label: "Registrar tentativa de contato",
    titulo: "Registrar uma tentativa de contato",
    descricao: "Use quando ligou, mandou mensagem ou e-mail e a família ainda não respondeu. Fica registrado com data e hora.",
    variant: "secondary",
    withNote: true,
    quando: ["selecionada", "contato_tentado"],
  },
  {
    tipo: "contato_confirmado",
    label: "Família avisada",
    titulo: "Confirmar que a família foi avisada",
    descricao: "A família recebeu o aviso da vaga. A partir de agora contam os 3 dias úteis para comparecer.",
    variant: "primary",
    withNote: true,
    quando: ["selecionada", "contato_tentado"],
  },
  {
    tipo: "matricula_confirmada",
    label: "Confirmar matrícula",
    titulo: "Confirmar a matrícula",
    descricao: "A família compareceu à unidade e a matrícula foi efetivada. A vaga sai da lista de pendências.",
    variant: "primary",
    quando: ["selecionada", "contato_tentado", "contato_confirmado"],
  },
  {
    tipo: "recusa",
    label: "Família recusou",
    titulo: "Registrar recusa da família",
    descricao: "A família não quer esta vaga. Ela volta imediatamente para a fila e pode ser oferecida à próxima criança.",
    variant: "danger",
    withNote: true,
    quando: ["selecionada", "contato_tentado", "contato_confirmado"],
  },
  {
    tipo: "expiracao",
    label: "Prazo vencido",
    titulo: "Registrar prazo vencido",
    descricao: "A família não respondeu ou não compareceu dentro do prazo. A vaga volta para a fila.",
    variant: "danger",
    withNote: true,
    quando: ["selecionada", "contato_tentado", "contato_confirmado"],
  },
];

const TIPO_EVENTO_LABEL: Record<string, string> = {
  selecionada: "Vaga selecionada para a criança",
  criacao: "Convocação criada",
  tentativa_contato: "Tentativa de contato",
  contato_confirmado: "Família avisada",
  matricula_confirmada: "Matrícula confirmada",
  recusa: "Família recusou a vaga",
  expiracao: "Prazo vencido",
  liberacao: "Vaga liberada — a família confirmou em outra unidade",
  liberada: "Vaga liberada — a família confirmou em outra unidade",
};

export default function ConvocacaoDetalhePage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const qc = useQueryClient();
  const toast = useToast();
  const base = useBase();
  const [acao, setAcao] = useState<Acao | null>(null);

  const q = useQuery({
    queryKey: ["convocacao", id],
    queryFn: () => getConvocacao(id),
    enabled: Number.isFinite(id),
  });

  const mut = useMutation({
    mutationFn: ({ tipo, nota }: { tipo: EventoTipo; nota: string }) =>
      registrarEvento(id, { tipo, payload: nota ? { observacao: nota } : {} }),
    onSuccess: (res) => {
      toast.show(`Registrado. Situação agora: ${res.status}`);
      setAcao(null);
      qc.invalidateQueries({ queryKey: ["convocacao", id] });
      qc.invalidateQueries({ queryKey: ["convocacoes"] });
      qc.invalidateQueries({ queryKey: ["painel-resumo"] });
      qc.invalidateQueries({ queryKey: ["painel-unidades"] });
    },
    onError: (e) => toast.show(`Não deu para registrar: ${e instanceof Error ? e.message : String(e)}`),
  });

  const c = q.data;
  const crumbs = [{ label: "Painel", to: base || "/" }, { label: "Convocações", to: `${base}/convocacoes` }, { label: `#${idParam}` }];

  if (!Number.isFinite(id)) {
    return (
      <Page title="Convocação" crumbs={crumbs}>
        <EmptyState title="Endereço inválido" />
      </Page>
    );
  }

  const encerrada = c ? STATUS_ENCERRADOS.includes(c.status) : false;
  const irmas = c?.irmas ?? [];
  const acoesDisponiveis = c ? ACOES.filter((a) => a.quando.includes(c.status)) : [];

  return (
    <Page
      title={c ? `${c.aluno_anon ?? `Inscrição #${c.inscricao_id}`}` : "Convocação"}
      subtitle={c ? `${c.unidade_nome ?? c.unidade_codigo} · ${c.grupamento} · ${c.horario}` : undefined}
      crumbs={crumbs}
      actions={c && <StatusPill status={c.status} />}
    >
      {q.isLoading && <Spinner label="Abrindo a convocação…" />}
      {q.isError && <ErrorBox error={q.error} />}
      {c && (
        <div className="grid-2">
          <div className="stack">
            <Card title="Situação">
              <dl className="dl">
                <dt>Nesta situação há</dt>
                <dd className="tabular">{fmtHoras(c.horas_no_status)}</dd>
                <dt>Prazo</dt>
                <dd>{encerrada ? "—" : `${prazoTexto(c.prazo_fim)}${c.prazo_fim ? ` (${fmtDateTime(c.prazo_fim)})` : ""}`}</dd>
                <dt>Criada em</dt>
                <dd>{fmtDateTime(c.criada_em)}</dd>
                <dt>Última mudança</dt>
                <dd>{fmtDateTime(c.atualizada_em)}</dd>
                <dt>Unidade</dt>
                <dd>
                  <Link to={`${base}/unidades/${encodeURIComponent(c.unidade_codigo)}`}>{c.unidade_nome ?? c.unidade_codigo}</Link>
                  {c.cre && <span className="muted"> · {c.cre}ª CRE</span>}
                </dd>
                <dt>Inscrição</dt>
                <dd>
                  <Link to={`${base}/inscricoes/${c.inscricao_id}`}>#{c.inscricao_id} · ver ficha</Link>
                </dd>
              </dl>
            </Card>

            <Card title="Outras vagas desta criança">
              {irmas.length === 0 ? (
                <p className="muted text-sm">Esta é a única convocação ativa desta criança.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {irmas.map((i) => (
                    <li key={i.id} className="row" style={{ justifyContent: "space-between" }}>
                      <Link to={`${base}/convocacoes/${i.id}`}>{i.unidade_nome ?? i.unidade_codigo ?? `convocação #${i.id}`}</Link>
                      <StatusPill status={i.status} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-sm muted" style={{ marginTop: 12 }}>
                Quando a família confirma em uma unidade, as outras vagas reservadas são liberadas na hora para a próxima criança da fila.
              </p>
            </Card>

            <Card title="O que fazer agora">
              {encerrada ? (
                <p className="muted text-sm">Esta convocação está encerrada. Nada mais a registrar.</p>
              ) : (
                <div className="row">
                  {acoesDisponiveis.map((a) => (
                    <Button key={a.tipo} variant={a.variant} onClick={() => setAcao(a)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-sm muted" style={{ marginTop: 12 }}>
                Toda ação fica registrada com data, hora e quem registrou. Nada é apagado.
              </p>
            </Card>
          </div>

          <Card title="Histórico">
            {c.eventos.length === 0 ? (
              <EmptyState title="Ainda sem registros" />
            ) : (
              <ol className="timeline">
                {[...c.eventos]
                  .sort((a, b) => new Date(b.ocorrido_em).getTime() - new Date(a.ocorrido_em).getTime())
                  .map((e) => (
                    <li key={e.id}>
                      <time dateTime={e.ocorrido_em}>{fmtDateTime(e.ocorrido_em)}</time>
                      <strong>{TIPO_EVENTO_LABEL[e.tipo] ?? e.tipo}</strong>
                      {e.ator && <span className="muted text-sm"> · {e.ator}</span>}
                      {e.payload && typeof e.payload.observacao === "string" && e.payload.observacao && (
                        <div className="text-sm">{e.payload.observacao}</div>
                      )}
                      {e.payload && typeof e.payload.canal === "string" && (
                        <div className="text-sm muted">canal: {e.payload.canal}</div>
                      )}
                    </li>
                  ))}
              </ol>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={acao !== null}
        title={acao?.titulo ?? ""}
        description={acao?.descricao}
        confirmLabel={acao?.label}
        danger={acao?.variant === "danger"}
        withNote={acao?.withNote}
        busy={mut.isPending}
        onCancel={() => setAcao(null)}
        onConfirm={(nota) => acao && mut.mutate({ tipo: acao.tipo, nota })}
      />
      <Toast message={toast.message} />
    </Page>
  );
}
