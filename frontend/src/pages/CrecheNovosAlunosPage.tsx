import { useMemo, useState } from "react";
import { MessageCircleQuestion, PhoneCall, UserX } from "lucide-react";
import { Page, Card, DataTable, Pill, Toast, Pagination, paginar, fmtDateTime } from "../design-system";
import { useToast } from "../components/useToast";
import { AvancarFluxoWizard } from "../creche/AvancarFluxoWizard";
import { ResultadoContato, registrarResultadoContato, situacaoMensageria } from "../creche/contato";
import { registrarAprovacao } from "../creche/ocupacaoStore";
import {
  PRAZO_1A_PERGUNTA_VISITA_DIAS,
  PRAZO_2A_PERGUNTA_E_LIGACAO_DIAS,
  PRAZO_PERDA_VAGA_DIAS,
  perderVagaPorNaoComparecimento,
  perguntarConfirmacaoVisita,
} from "../creche/fluxoConvocacao";
import {
  Contato,
  NOVOS_ALUNOS_EXEMPLO,
  NovoAluno,
  PRAZO_COMPARECIMENTO_DIAS,
  SEGMENTO_LABEL,
  TAMANHO_PAGINA_GALERIA,
  UNIDADE_EXEMPLO,
  ligarHoje,
  ordenarAprovadosAlfabetico,
  ordenarConvocados,
  ordenarPerderamVaga,
} from "../creche/mock";

function ContatosCell({ principal, outros }: { principal: Contato; outros: Contato[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <div>
        <strong>{principal.nome}</strong>
        <div className="text-sm muted">{principal.telefone}</div>
      </div>
      {outros.length > 0 && (
        <>
          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", marginTop: 4 }} onClick={() => setAberto((v) => !v)}>
            {aberto ? "ocultar" : `+${outros.length} outro(s) contato(s)`}
          </button>
          {aberto && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: "var(--fs-sm)" }}>
              {outros.map((c) => (
                <li key={c.telefone}>
                  {c.nome} — {c.telefone}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ResultadoContatoCell({ onRegistrar }: { onRegistrar: (resultado: ResultadoContato) => void }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRegistrar("aceitou_visita")}>
        Aceitou visita
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRegistrar("nao_atendeu")}>
        Não atendeu
      </button>
      <button type="button" className="btn btn-danger btn-sm" onClick={() => onRegistrar("recusou")}>
        Recusou
      </button>
    </div>
  );
}

function CardConvocado({
  aluno,
  onAvancar,
  onPerguntarVisita,
  onPerderVaga,
}: {
  aluno: NovoAluno;
  onAvancar: (a: NovoAluno) => void;
  onPerguntarVisita: (a: NovoAluno) => void;
  onPerderVaga: (a: NovoAluno) => void;
}) {
  const urgente = aluno.prazoDiasRestantes <= 1;
  const prazoVencido = aluno.prazoDiasRestantes <= 0;
  return (
    <div className="aluno-card">
      <span className={`aluno-card-nome ${urgente ? "aluno-card-nome-urgente" : ""}`}>
        {aluno.nome}
        {urgente && <span className="aluno-card-urgente-tag"> (um dia até prazo)</span>}
      </span>
      <span className="aluno-card-meta">{SEGMENTO_LABEL[aluno.segmento]}</span>
      <span className="aluno-card-meta">Contato: {aluno.contatoPrincipal.nome}</span>
      <Pill tone={urgente ? "danger" : "info"}>Faltam {aluno.prazoDiasRestantes} dia(s)</Pill>
      {aluno.confirmacaoVisita === "sim" && <Pill tone="ok">Confirmou que vai à visita</Pill>}
      {aluno.confirmacaoVisita === "nao" && <Pill tone="warn">Disse que não vai</Pill>}
      {aluno.confirmacaoVisita == null && aluno.ligacaoTentada && <Pill tone="warn">Sem resposta — ligação feita</Pill>}
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {aluno.confirmacaoVisita !== "sim" && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPerguntarVisita(aluno)}>
            Perguntar se vai à visita
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAvancar(aluno)}>
          Avançar fluxo
        </button>
        {prazoVencido && (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => onPerderVaga(aluno)}>
            Registrar perda de vaga
          </button>
        )}
      </div>
    </div>
  );
}

export default function CrecheNovosAlunosPage() {
  const [alunos, setAlunos] = useState<NovoAluno[]>(
    // a galeria só mostra os alunos convocados para esta unidade
    NOVOS_ALUNOS_EXEMPLO.filter((a) => a.unidadeCodigo === UNIDADE_EXEMPLO.codigo),
  );
  const [aprovadosAbertos, setAprovadosAbertos] = useState(false);
  const [alunoEmFluxo, setAlunoEmFluxo] = useState<NovoAluno | null>(null);
  const [paginaConvocados, setPaginaConvocados] = useState(1);
  const [paginaAprovados, setPaginaAprovados] = useState(1);
  const [paginaLigar, setPaginaLigar] = useState(1);
  const [paginaPerdeuVaga, setPaginaPerdeuVaga] = useState(1);
  const [buscaAprovados, setBuscaAprovados] = useState("");
  const [buscaLigar, setBuscaLigar] = useState("");
  const { message, show } = useToast();

  const convocados = useMemo(() => ordenarConvocados(alunos.filter((a) => a.status === "convocado")), [alunos]);
  const perderamVaga = useMemo(() => ordenarPerderamVaga(alunos), [alunos]);

  const aprovados = useMemo(() => {
    const termo = buscaAprovados.trim().toLowerCase();
    const base = ordenarAprovadosAlfabetico(alunos.filter((a) => a.status === "aprovado"));
    return termo ? base.filter((a) => a.nome.toLowerCase().includes(termo)) : base;
  }, [alunos, buscaAprovados]);

  const listaLigar = useMemo(() => {
    const termo = buscaLigar.trim().toLowerCase();
    const base = ligarHoje(alunos);
    return termo ? base.filter((r) => r.nome.toLowerCase().includes(termo)) : base;
  }, [alunos, buscaLigar]);

  function aoAprovar(alunoId: string, autorizadoPor: string) {
    const aluno = alunos.find((a) => a.id === alunoId);
    setAlunos((atual) =>
      atual.map((a) =>
        a.id === alunoId ? { ...a, status: "aprovado", aprovadoPor: autorizadoPor, aprovadoEm: new Date().toISOString() } : a,
      ),
    );
    if (aluno) registrarAprovacao(aluno.segmento, aluno.nome); // conta na "Administração de Vagas" automaticamente
    setAlunoEmFluxo(null);
    show(`Matrícula aprovada por ${autorizadoPor}.`);
  }

  function aoAdiarPrazo(alunoId: string) {
    setAlunos((atual) =>
      atual.map((a) => (a.id === alunoId ? { ...a, prazoDiasRestantes: a.prazoDiasRestantes + 1 } : a)),
    );
    setAlunoEmFluxo(null);
    show("Prazo de comparecimento adiado em 1 dia.");
  }

  async function aoPerguntarVisita(aluno: NovoAluno) {
    const diaAtual = PRAZO_COMPARECIMENTO_DIAS - aluno.prazoDiasRestantes || 1;
    await perguntarConfirmacaoVisita(
      { id: aluno.id, nome: aluno.nome, contatoPrincipal: aluno.contatoPrincipal },
      diaAtual,
    );
    show(`Pergunta de confirmação enviada a ${aluno.contatoPrincipal.nome} (WhatsApp).`);
  }

  async function aoPerderVaga(aluno: NovoAluno) {
    await perderVagaPorNaoComparecimento({ id: aluno.id, nome: aluno.nome, contatoPrincipal: aluno.contatoPrincipal });
    setAlunos((atual) =>
      atual.map((a) => (a.id === aluno.id ? { ...a, status: "perdeu_vaga", perdeuVagaEm: new Date().toISOString() } : a)),
    );
    show(`${aluno.nome} perdeu a vaga por não comparecimento — reparelhamento iniciado.`);
  }

  function aoRegistrarContato(alunoId: string, resultado: ResultadoContato) {
    registrarResultadoContato(alunoId, resultado);
    if (resultado === "recusou") {
      // fluxo de recusa: tira a criança da lista de convocados desta unidade
      setAlunos((atual) => atual.map((a) => (a.id === alunoId ? { ...a, status: "recusado", ultimoContato: resultado } : a)));
      show("Recusa registrada — a criança saiu da lista desta unidade.");
    } else {
      setAlunos((atual) => atual.map((a) => (a.id === alunoId ? { ...a, ultimoContato: resultado } : a)));
      show(resultado === "aceitou_visita" ? "Aceite de visita registrado." : "Tentativa sem sucesso registrada.");
    }
  }

  return (
    <Page
      title="Crianças convocadas"
      subtitle="Convocados desta unidade têm 3 dias para comparecer. A creche confirma a matrícula quando o responsável aparece."
    >
      <Card
        title="Central de mensageria — responsáveis para contatar hoje"
        actions={<span className="text-sm muted">contato automático em construção</span>}
        flush
      >
        <p className="text-sm muted" style={{ padding: "0 16px" }}>
          Por enquanto o resultado é lançado à mão nos botões abaixo. A ideia é que um container de
          mensageria (WhatsApp) já ligue pela pipeline e preencha a coluna "Situação" sozinho.
        </p>
        <div style={{ padding: "16px 16px 0" }}>
          <label className="field">
            <span>Buscar por nome</span>
            <input
              value={buscaLigar}
              onChange={(e) => {
                setBuscaLigar(e.target.value);
                setPaginaLigar(1);
              }}
              placeholder="ex.: Miguel"
            />
          </label>
        </div>
        {listaLigar.length === 0 ? (
          <div style={{ padding: 16 }} className="muted">
            {buscaLigar ? "Nenhum resultado para essa busca." : "Ninguém pendente de contato hoje."}
          </div>
        ) : (
          <DataTable
            rows={paginar(listaLigar, paginaLigar, TAMANHO_PAGINA_GALERIA)}
            rowKey={(r) => r.alunoId}
            columns={[
              { key: "nome", header: "Criança", render: (r) => r.nome },
              {
                key: "contato",
                header: "Contato",
                render: (r) => <ContatosCell principal={r.contatoPrincipal} outros={r.outrosContatos} />,
              },
              {
                key: "situacao",
                header: "Situação",
                render: (r) => {
                  const s = situacaoMensageria(r.ultimoContato);
                  return <Pill tone={s.tone}>{s.label}</Pill>;
                },
              },
              {
                key: "resultado",
                header: "Registrar manualmente",
                render: (r) => <ResultadoContatoCell onRegistrar={(resultado) => aoRegistrarContato(r.alunoId, resultado)} />,
              },
            ]}
            footer={
              <Pagination page={paginaLigar} pageSize={TAMANHO_PAGINA_GALERIA} total={listaLigar.length} onPageChange={setPaginaLigar} />
            }
          />
        )}
      </Card>

      <Card title="Cronograma de comparecimento" actions={<span className="text-sm muted">3 dias (72 h) a partir do aviso à família</span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", paddingBottom: 12, borderBottom: "1px solid var(--mr-grey-200)" }}>
            <MessageCircleQuestion size={20} style={{ color: "var(--info)" }} aria-hidden="true" />
            <div>
              <strong>Dia {PRAZO_1A_PERGUNTA_VISITA_DIAS}</strong>
              <p className="text-sm muted">Mensageria pergunta ao responsável se ele vai à visita confirmar a vaga</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", paddingBottom: 12, borderBottom: "1px solid var(--mr-grey-200)" }}>
            <PhoneCall size={20} style={{ color: "var(--warn)" }} aria-hidden="true" />
            <div>
              <strong>Dia {PRAZO_2A_PERGUNTA_E_LIGACAO_DIAS}</strong>
              <p className="text-sm muted">Pergunta repetida; se ainda sem resposta, a unidade liga para o contato principal</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <UserX size={20} style={{ color: "var(--danger)" }} aria-hidden="true" />
            <div>
              <strong>Dia {PRAZO_PERDA_VAGA_DIAS}</strong>
              <p className="text-sm muted">
                Sem confirmação no prazo, a vaga volta para a fila e o motor convoca a próxima criança. As outras
                reservas da família continuam valendo — o histórico fica registrado e não é apagado.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card title={`Convocados (${convocados.length})`}>
        {convocados.length === 0 ? (
          <p className="muted">Nenhum convocado aguardando comparecimento nesta unidade.</p>
        ) : (
          <>
            <div className="aluno-grid">
              {paginar(convocados, paginaConvocados, TAMANHO_PAGINA_GALERIA).map((a) => (
                <CardConvocado
                  key={a.id}
                  aluno={a}
                  onAvancar={setAlunoEmFluxo}
                  onPerguntarVisita={aoPerguntarVisita}
                  onPerderVaga={aoPerderVaga}
                />
              ))}
            </div>
            <Pagination page={paginaConvocados} pageSize={TAMANHO_PAGINA_GALERIA} total={convocados.length} onPageChange={setPaginaConvocados} />
          </>
        )}
      </Card>

      <Card
        title={`Alunos aprovados (${aprovados.length})`}
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAprovadosAbertos((v) => !v)}>
            {aprovadosAbertos ? "Minimizar" : "Mostrar"}
          </button>
        }
      >
        {aprovadosAbertos && (
          <>
            <label className="field" style={{ marginBottom: "var(--sp-3)" }}>
              <span>Buscar por nome</span>
              <input
                value={buscaAprovados}
                onChange={(e) => {
                  setBuscaAprovados(e.target.value);
                  setPaginaAprovados(1);
                }}
                placeholder="ex.: Davi"
              />
            </label>
            {aprovados.length === 0 ? (
              <p className="muted">Nenhum resultado para essa busca.</p>
            ) : (
              <>
                <div className="aluno-grid">
                  {paginar(aprovados, paginaAprovados, TAMANHO_PAGINA_GALERIA).map((a) => (
                    <div className="aluno-card" key={a.id}>
                      <span className="aluno-card-nome">{a.nome}</span>
                      <span className="aluno-card-meta">{SEGMENTO_LABEL[a.segmento]}</span>
                      <Pill tone="ok">Matrícula confirmada</Pill>
                      {a.aprovadoPor && <span className="aluno-card-meta">Autorizado por {a.aprovadoPor}</span>}
                    </div>
                  ))}
                </div>
                <Pagination page={paginaAprovados} pageSize={TAMANHO_PAGINA_GALERIA} total={aprovados.length} onPageChange={setPaginaAprovados} />
              </>
            )}
          </>
        )}
        {!aprovadosAbertos && <p className="text-sm muted">Em ordem alfabética — clique em "Mostrar" para ver a lista.</p>}
      </Card>

      {perderamVaga.length > 0 && (
        <Card title={`Prazo vencido (${perderamVaga.length})`} flush>
          <p className="text-sm muted" style={{ padding: "0 16px" }}>
            Não confirmaram presença em 3 dias (72 h). A vaga voltou para a fila; a criança aparece aqui por 3 dias
            enquanto o motor repassa a vaga ao próximo da fila.
          </p>
          <DataTable
            rows={paginar(perderamVaga, paginaPerdeuVaga, TAMANHO_PAGINA_GALERIA)}
            rowKey={(a) => a.id}
            columns={[
              { key: "nome", header: "Criança", render: (a) => a.nome },
              { key: "segmento", header: "Grupamento", render: (a) => SEGMENTO_LABEL[a.segmento] },
              { key: "contato", header: "Contato", render: (a) => a.contatoPrincipal.nome },
              {
                key: "status",
                header: "Status",
                render: (a) => <Pill tone="danger">Prazo vencido{a.perdeuVagaEm ? ` — ${fmtDateTime(a.perdeuVagaEm)}` : ""}</Pill>,
              },
            ]}
            footer={
              <Pagination page={paginaPerdeuVaga} pageSize={TAMANHO_PAGINA_GALERIA} total={perderamVaga.length} onPageChange={setPaginaPerdeuVaga} />
            }
          />
        </Card>
      )}

      {alunoEmFluxo && (
        <AvancarFluxoWizard aluno={alunoEmFluxo} onFechar={() => setAlunoEmFluxo(null)} onAprovado={aoAprovar} onPrazoAdiado={aoAdiarPrazo} />
      )}
      <Toast message={message} />
    </Page>
  );
}
