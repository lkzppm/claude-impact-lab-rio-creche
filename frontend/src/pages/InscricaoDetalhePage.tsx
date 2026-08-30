import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { comprovarInscricao, getComprovacoes, getInscricao } from "../api/client";
import type { Comprovacao, Opcao, Resposta } from "../api/types";
import {
  Page,
  Card,
  DataTable,
  Spinner,
  ErrorBox,
  EmptyState,
  Button,
  Pill,
  ComprovacaoPill,
  Toast,
  fmtDateTime,
  fmtInt,
} from "../design-system";
import { useToast } from "../components/useToast";
import { useArea } from "../areas/AreaContext";

const SITUACAO_TONE: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  Confirmado: "ok",
  "Lista de espera": "warn",
  Selecionado: "info",
  "Selecionado da lista": "info",
  Ativo: "info",
  Cancelado: "neutral",
  "Cancelado na confirmacao": "danger",
  "Cancelado pelo sistema": "neutral",
};

export default function InscricaoDetalhePage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const qc = useQueryClient();
  const toast = useToast();
  const { base, area } = useArea();

  const q = useQuery({ queryKey: ["inscricao", id], queryFn: () => getInscricao(id), enabled: Number.isFinite(id) });
  const comp = useQuery({ queryKey: ["comprovacoes", id], queryFn: () => getComprovacoes(id), enabled: Number.isFinite(id) });

  const consultar = useMutation({
    mutationFn: () => comprovarInscricao(id),
    onSuccess: (rows) => {
      qc.setQueryData(["comprovacoes", id], rows);
      qc.invalidateQueries({ queryKey: ["comprovacoes", id] });
      qc.invalidateQueries({ queryKey: ["inscricao", id] });
      const ok = rows.filter((r) => r.resultado === "confirmado").length;
      toast.show(`Consulta feita: ${ok} de ${rows.length} critério(s) confirmado(s).`);
    },
    onError: (e) => toast.show(`A consulta falhou: ${e instanceof Error ? e.message : String(e)}`),
  });

  const i = q.data;
  const crumbs = area === "sme"
    ? [{ label: "Rede", to: "/sme" }, { label: "Inscrições", to: "/sme/inscricoes" }, { label: i?.aluno_anon ?? `#${idParam}` }]
    : [{ label: "Painel", to: base || "/" }, { label: i?.aluno_anon ?? `#${idParam}` }];

  if (!Number.isFinite(id)) {
    return (
      <Page title="Inscrição" crumbs={crumbs}>
        <EmptyState title="Endereço inválido" />
      </Page>
    );
  }

  const respostasSim = (i?.respostas ?? []).filter((r) => r.resposta);
  const pontosDeclarados = respostasSim.reduce((acc, r) => acc + (r.pontuacao ?? 0), 0);

  return (
    <Page
      title={i ? i.aluno_anon : "Inscrição"}
      subtitle={i ? `Processo ${i.ano} · inscrição #${i.id} · ${i.pontuacao} ponto${i.pontuacao === 1 ? "" : "s"}` : undefined}
      crumbs={crumbs}
    >
      {q.isLoading && <Spinner label="Abrindo a ficha…" />}
      {q.isError && <ErrorBox error={q.error} />}
      {i && (
        <>
          <div className="grid-2">
            <Card title="Dados da inscrição">
              <dl className="dl">
                <dt>Criança</dt>
                <dd>{i.aluno_anon}</dd>
                <dt>Nascimento</dt>
                <dd>{i.nascimento_anomes ?? "—"}</dd>
                <dt>Sexo</dt>
                <dd>{i.sexo === "F" ? "Feminino" : i.sexo === "M" ? "Masculino" : "—"}</dd>
                <dt>Responsável</dt>
                <dd>{i.responsavel_anon ?? "—"}</dd>
                <dt>Bairro</dt>
                <dd>{i.bairro ?? <span className="muted">não informado</span>}</dd>
                <dt>CEP</dt>
                <dd>{i.cep ?? <span className="muted">não informado</span>}</dd>
                <dt>Inscrita em</dt>
                <dd>{fmtDateTime(i.data_criacao)}</dd>
                <dt>Chave SME</dt>
                <dd>
                  <code className="text-sm">
                    prm {i.prm_id} · plm {i.plm_id} · ipl {i.ipl_id}
                  </code>
                </dd>
                <dt>Pontuação</dt>
                <dd>
                  <strong>{i.pontuacao}</strong>
                  {pontosDeclarados !== i.pontuacao && (
                    <span className="muted text-sm"> · {pontosDeclarados} declarados no questionário</span>
                  )}
                </dd>
              </dl>
            </Card>

            <Card title="Opções escolhidas, em ordem" flush>
              {i.opcoes.length === 0 ? (
                <EmptyState title="Sem opções registradas" />
              ) : (
                <DataTable<Opcao>
                  rows={[...i.opcoes].sort((a, b) => a.ordem - b.ordem)}
                  rowKey={(o) => o.id}
                  columns={[
                    { key: "ordem", header: "Opção", render: (o) => <strong>{o.ordem}ª</strong> },
                    {
                      key: "unidade",
                      header: "Unidade",
                      render: (o) => <Link to={`${base}/unidades/${encodeURIComponent(o.unidade_codigo)}`}>{o.unidade_nome ?? o.unidade_codigo}</Link>,
                    },
                    { key: "grup", header: "Grupamento", render: (o) => o.grupamento },
                    { key: "hor", header: "Turno", render: (o) => o.horario },
                    {
                      key: "sit",
                      header: "Desfecho na SME",
                      render: (o) =>
                        o.situacao_origem ? <Pill tone={SITUACAO_TONE[o.situacao_origem] ?? "neutral"}>{o.situacao_origem}</Pill> : <span className="muted">—</span>,
                    },
                  ]}
                  footer={<span>"Desfecho na SME" é o que aconteceu no processo original; serve para comparar com o resultado do motor.</span>}
                />
              )}
            </Card>
          </div>

          <Card
            title="Comprovações automáticas"
            actions={
              <Button onClick={() => consultar.mutate()} disabled={consultar.isPending}>
                {consultar.isPending ? "Consultando…" : "Consultar bases oficiais"}
              </Button>
            }
          >
            <p className="text-sm muted" style={{ marginBottom: 12 }}>
              Os critérios declarados são checados nas bases do governo (CadÚnico, Bolsa Família e outras) em vez de exigir papel na
              unidade. Cada consulta gera um protocolo.
            </p>
            {comp.isLoading && <Spinner label="Carregando comprovações…" />}
            {comp.isError && <ErrorBox error={comp.error} />}
            {comp.data && comp.data.length === 0 && (
              <EmptyState title="Nenhuma consulta feita ainda">
                <p>Clique em "Consultar bases oficiais" para verificar os critérios declarados.</p>
              </EmptyState>
            )}
            {comp.data && comp.data.length > 0 && (
              <DataTable<Comprovacao>
                rows={comp.data}
                rowKey={(c) => `${c.criterio}-${c.fonte}`}
                columns={[
                  { key: "crit", header: "Critério", render: (c) => <strong>{c.criterio}</strong> },
                  { key: "fonte", header: "Base consultada", render: (c) => c.fonte },
                  { key: "res", header: "Resultado", render: (c) => <ComprovacaoPill resultado={c.resultado} /> },
                  { key: "prot", header: "Protocolo", render: (c) => (c.protocolo ? <code className="text-sm">{c.protocolo}</code> : <span className="muted">—</span>) },
                  { key: "quando", header: "Consultado em", render: (c) => fmtDateTime(c.consultado_em), sortValue: (c) => c.consultado_em ?? "" },
                ]}
              />
            )}
          </Card>

          <Card title="Respostas ao questionário" flush>
            {i.respostas.length === 0 ? (
              <EmptyState title="Sem respostas registradas" />
            ) : (
              <DataTable<Resposta>
                rows={[...i.respostas].sort((a, b) => (b.pontuacao ?? 0) - (a.pontuacao ?? 0))}
                rowKey={(r) => r.ich_perg_id}
                rowClass={(r) => (r.resposta && (r.pontuacao ?? 0) > 0 ? "row-ok" : undefined)}
                columns={[
                  { key: "texto", header: "Critério", render: (r) => r.texto ?? `pergunta ${r.ich_perg_id}` },
                  { key: "pts", header: "Vale", numeric: true, render: (r) => (r.pontuacao == null ? "—" : r.pontuacao === 0 ? "desempate" : `${r.pontuacao} pts`), sortValue: (r) => r.pontuacao ?? 0 },
                  { key: "resp", header: "Declarou", render: (r) => (r.resposta ? <Pill tone="info">Sim</Pill> : <span className="muted">Não</span>) },
                  { key: "conf", header: "Confirmado na SME", render: (r) => (r.confirmado ? <Pill tone="ok">Sim</Pill> : <span className="muted">Não</span>) },
                ]}
                footer={
                  <span>
                    {fmtInt(respostasSim.length)} critério(s) declarado(s). A coluna "Confirmado na SME" vem da base original e é pouco preenchida a partir de 2022.
                  </span>
                }
              />
            )}
          </Card>
        </>
      )}
      <Toast message={toast.message} />
    </Page>
  );
}
