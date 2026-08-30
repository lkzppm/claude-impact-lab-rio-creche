import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, getFamiliaInscricao, responderConvocacao } from "../api/client";
import type { FamiliaConvocacao, FamiliaInscricao, FamiliaResposta } from "../api/types";
import { ConfirmDialog, Spinner, StatusPill, Toast, fmtDateTime } from "../design-system";
import { useToast } from "../components/useToast";
import { FormularioCodigo, salvarCodigo } from "./FamiliaPage";

const ORDINAL = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª"];

function ordinal(n: number) {
  return ORDINAL[n - 1] ?? `${n}ª`;
}

function tempoRestante(h: number | null | undefined): string {
  if (h == null) return "";
  if (h <= 0) return "prazo encerrado";
  if (h < 1) return "menos de 1 hora";
  if (h < 24) return `${Math.round(h)} hora${Math.round(h) === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  const r = Math.round(h % 24);
  return r ? `${d} dia${d === 1 ? "" : "s"} e ${r}h` : `${d} dia${d === 1 ? "" : "s"}`;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
}

function Banner({ d }: { d: FamiliaInscricao }) {
  const abertas = d.convocacoes.filter((c) => c.pode_responder);
  const confirmada = d.convocacoes.find((c) => c.status === "confirmada");
  const prazo = abertas.map((c) => c.prazo_fim).filter(Boolean).sort()[0];
  switch (d.situacao_resumo) {
    case "reservas_abertas":
      return (
        <div className="fam-banner fam-banner-ok">
          <strong>
            Você tem {abertas.length} vaga{abertas.length === 1 ? "" : "s"} reservada{abertas.length === 1 ? "" : "s"}.
          </strong>
          <span>{prazo ? `Escolha uma até ${fmtData(prazo)}.` : "Escolha uma abaixo."}</span>
        </div>
      );
    case "matricula_confirmada":
      return (
        <div className="fam-banner fam-banner-ok">
          <strong>Matrícula confirmada{confirmada ? ` em ${confirmada.unidade_nome ?? confirmada.unidade_codigo}` : ""}.</strong>
          <span>Leve os documentos à unidade para concluir. Parabéns!</span>
        </div>
      );
    case "lista_espera":
      return (
        <div className="fam-banner fam-banner-info">
          <strong>Sua criança está na lista de espera.</strong>
          <span>Quando surgir vaga em uma das unidades escolhidas, você é avisada por aqui e pelo telefone cadastrado.</span>
        </div>
      );
    case "sem_opcao_viavel":
      return (
        <div className="fam-banner fam-banner-warn">
          <strong>Nenhuma das unidades escolhidas tem vaga para o grupamento e o turno da sua criança.</strong>
          <span>Procure a unidade escolar mais próxima para revisar as opções.</span>
        </div>
      );
    default:
      return (
        <div className="fam-banner fam-banner-info">
          <strong>Inscrição recebida.</strong>
          <span>A classificação ainda não foi feita. Volte aqui depois da data publicada no Diário Oficial.</span>
        </div>
      );
  }
}

function ResultadoOpcao({ o }: { o: FamiliaInscricao["opcoes"][number] }) {
  if (o.resultado === "reservada") return <span className="pill pill-info">Vaga reservada para você</span>;
  if (o.resultado === "fila") return <span className="pill pill-warn">{o.posicao != null ? `Posição ${o.posicao} na fila` : "Na fila"}</span>;
  if (o.resultado === "sem_vaga") return <span className="pill pill-neutral">Sem vaga neste turno</span>;
  return <span className="pill pill-neutral">Aguardando</span>;
}

export default function FamiliaInscricaoPage() {
  const [sp] = useSearchParams();
  const codigo = (sp.get("codigo") ?? "").trim();
  const qc = useQueryClient();
  const toast = useToast();
  const [acao, setAcao] = useState<{ c: FamiliaConvocacao; resposta: FamiliaResposta } | null>(null);

  const q = useQuery({
    queryKey: ["familia", codigo],
    queryFn: () => getFamiliaInscricao(codigo),
    enabled: !!codigo,
    retry: false,
  });

  const responder = useMutation({
    mutationFn: ({ c, resposta }: { c: FamiliaConvocacao; resposta: FamiliaResposta }) => responderConvocacao(c.id, resposta),
    onSuccess: (_r, v) => {
      toast.show(v.resposta === "confirmar" ? "Vaga confirmada! As outras reservas foram liberadas." : "Resposta registrada.");
      setAcao(null);
      qc.invalidateQueries({ queryKey: ["familia", codigo] });
    },
    onError: (e) => toast.show(`Não deu para registrar: ${e instanceof Error ? e.message : String(e)}`),
  });

  if (!codigo) {
    return (
      <main className="fam">
        <div className="fam-wrap">
          <h1 className="fam-h1">Qual é o código da inscrição?</h1>
          <FormularioCodigo />
        </div>
      </main>
    );
  }

  if (q.isLoading) {
    return (
      <main className="fam">
        <div className="fam-wrap">
          <Spinner label="Buscando sua inscrição…" />
        </div>
      </main>
    );
  }

  if (q.isError) {
    const naoAchou = q.error instanceof ApiError && q.error.status === 404;
    return (
      <main className="fam">
        <div className="fam-wrap">
          <h1 className="fam-h1">{naoAchou ? "Não encontramos essa inscrição" : "Não foi possível consultar agora"}</h1>
          <p className="fam-lead">
            {naoAchou
              ? `Confira o código "${codigo}" no comprovante e tente de novo.`
              : "Tente novamente em alguns minutos. Se continuar, procure a unidade escolar."}
          </p>
          <FormularioCodigo inicial={codigo} />
          {naoAchou && (
            <Link className="btn btn-secondary fam-btn" to="/familia/pre-cadastro">
              Ainda não tenho inscrição — fazer pré-cadastro
            </Link>
          )}
          <p className="fam-rodape">Dúvidas? Procure a unidade escolar ou ligue 1746.</p>
        </div>
      </main>
    );
  }

  const d = q.data!;
  salvarCodigo(codigo);
  const abertas = d.convocacoes.filter((c) => c.pode_responder);
  const historico = d.convocacoes.filter((c) => !c.pode_responder);
  const declarados = d.pontuacao.criterios.filter((c) => c.declarado);

  return (
    <main className="fam">
      <div className="fam-wrap">
        <p className="fam-eyebrow">
          Inscrição {d.inscricao.aluno_anon ?? `#${d.inscricao.id}`} · {d.inscricao.ano}
          {d.inscricao.grupamento ? ` · ${d.inscricao.grupamento}` : ""}
          {d.inscricao.horario ? ` · ${d.inscricao.horario}` : ""}
        </p>
        <h1 className="fam-h1">Sua inscrição</h1>

        <Banner d={d} />

        {abertas.length > 0 && (
          <section className="fam-sec">
            <h2>Suas vagas reservadas</h2>
            <p className="fam-sec-lead">Escolha uma. Ao confirmar, as outras são liberadas na hora para outra criança da fila.</p>
            <ul className="fam-lista">
              {abertas.map((c) => (
                <li key={c.id} className="fam-vaga">
                  <div className="fam-vaga-nome">{c.unidade_nome ?? c.unidade_codigo}</div>
                  <div className="fam-vaga-prazo">
                    {c.prazo_fim ? (
                      <>
                        Responder até <strong>{fmtData(c.prazo_fim)}</strong>
                        {c.horas_restantes != null && <span> · faltam {tempoRestante(c.horas_restantes)}</span>}
                      </>
                    ) : (
                      "Sem prazo definido"
                    )}
                  </div>
                  <div className="fam-vaga-acoes">
                    <button type="button" className="btn btn-primary fam-btn" onClick={() => setAcao({ c, resposta: "confirmar" })}>
                      Quero esta vaga
                    </button>
                    <button type="button" className="btn btn-secondary fam-btn" onClick={() => setAcao({ c, resposta: "recusar" })}>
                      Não quero
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="fam-sec">
          <h2>Suas opções</h2>
          {d.opcoes.length === 0 ? (
            <p className="fam-sec-lead">Nenhuma unidade registrada nesta inscrição.</p>
          ) : (
            <ol className="fam-lista">
              {d.opcoes.map((o) => (
                <li key={o.ordem} className="fam-opcao">
                  <span className="fam-opcao-n">{ordinal(o.ordem)}</span>
                  <span className="fam-opcao-corpo">
                    <span className="fam-opcao-nome">{o.unidade_nome ?? o.unidade_codigo}</span>
                    {o.bairro && <span className="fam-opcao-bairro">{o.bairro}</span>}
                  </span>
                  <ResultadoOpcao o={o} />
                </li>
              ))}
            </ol>
          )}
        </section>

        {historico.length > 0 && (
          <section className="fam-sec">
            <h2>Convocações anteriores</h2>
            <ul className="fam-lista">
              {historico.map((c) => (
                <li key={c.id} className="fam-hist">
                  <span>{c.unidade_nome ?? c.unidade_codigo}</span>
                  <StatusPill status={c.status} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="fam-sec">
          <h2>Sua pontuação</h2>
          <p className="fam-pontos">
            <strong>{d.pontuacao.total}</strong> de {d.pontuacao.maxima} pontos
          </p>
          {declarados.length === 0 ? (
            <p className="fam-sec-lead">Nenhum critério de prioridade foi declarado nesta inscrição.</p>
          ) : (
            <ul className="fam-lista">
              {declarados.map((c) => (
                <li key={c.ich_perg_id} className="fam-crit">
                  <span className="fam-crit-texto">{c.texto}</span>
                  <span className="fam-crit-pontos">{c.pontos > 0 ? `${c.pontos} pts` : "desempate"}</span>
                  {c.comprovado === "confirmado" && <span className="pill pill-ok">Confirmado</span>}
                  {c.comprovado === "nao_encontrado" && <span className="pill pill-warn">Não encontrado</span>}
                  {c.comprovado === "erro" && <span className="pill pill-danger">Erro na consulta</span>}
                  {(c.comprovado === "pendente" || c.comprovado == null) && <span className="pill pill-neutral">Em verificação</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="fam-nota">Verificado automaticamente nas bases do governo (CadÚnico, Bolsa Família, Receita).</p>
        </section>

        {d.explicacao && (
          <section className="fam-sec fam-sec-quieta">
            <h2>Por que este resultado</h2>
            <p className="fam-explic">{d.explicacao}</p>
            {d.rodada && <p className="fam-nota">Classificação de {fmtDateTime(d.rodada.criada_em)}.</p>}
          </section>
        )}

        <p className="fam-rodape">
          Dúvidas? Procure a unidade escolar ou ligue 1746. · <Link to="/familia">Consultar outro código</Link>
        </p>
      </div>

      <ConfirmDialog
        open={acao !== null}
        title={acao?.resposta === "confirmar" ? "Confirmar esta vaga?" : "Recusar esta vaga?"}
        description={
          acao?.resposta === "confirmar"
            ? `Você confirma a vaga em ${acao.c.unidade_nome ?? acao.c.unidade_codigo}. Ao confirmar, as outras reservas são liberadas para outra criança.`
            : `A vaga em ${acao?.c.unidade_nome ?? acao?.c.unidade_codigo} volta para a fila e é oferecida a outra criança. Suas outras reservas continuam valendo.`
        }
        confirmLabel={acao?.resposta === "confirmar" ? "Sim, quero esta vaga" : "Sim, não quero"}
        danger={acao?.resposta === "recusar"}
        busy={responder.isPending}
        onCancel={() => setAcao(null)}
        onConfirm={() => acao && responder.mutate(acao)}
      />
      <Toast message={toast.message} />
    </main>
  );
}
