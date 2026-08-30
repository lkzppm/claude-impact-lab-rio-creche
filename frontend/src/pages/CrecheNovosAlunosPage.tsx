import { useMemo, useState } from "react";
import { Page, Card, DataTable, Pill, Toast, Pagination, paginar } from "../design-system";
import { useToast } from "../components/useToast";
import { AvancarFluxoWizard } from "../creche/AvancarFluxoWizard";
import { ResultadoContato, registrarResultadoContato, situacaoMensageria } from "../creche/contato";
import {
  Contato,
  NOVOS_ALUNOS_EXEMPLO,
  NovoAluno,
  SEGMENTO_LABEL,
  TAMANHO_PAGINA_GALERIA,
  UNIDADE_EXEMPLO,
  ligarHoje,
  ordenarAprovadosAlfabetico,
  ordenarConvocados,
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

function CardConvocado({ aluno, onAvancar }: { aluno: NovoAluno; onAvancar: (a: NovoAluno) => void }) {
  const urgente = aluno.prazoDiasRestantes <= 1;
  return (
    <div className="aluno-card">
      <span className={`aluno-card-nome ${urgente ? "aluno-card-nome-urgente" : ""}`}>
        {aluno.nome}
        {urgente && <span className="aluno-card-urgente-tag"> (um dia até prazo)</span>}
      </span>
      <span className="aluno-card-meta">{SEGMENTO_LABEL[aluno.segmento]}</span>
      <span className="aluno-card-meta">Contato: {aluno.contatoPrincipal.nome}</span>
      <Pill tone={urgente ? "danger" : "info"}>Faltam {aluno.prazoDiasRestantes} dia(s)</Pill>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAvancar(aluno)}>
        Avançar fluxo
      </button>
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
  const [buscaAprovados, setBuscaAprovados] = useState("");
  const [buscaLigar, setBuscaLigar] = useState("");
  const { message, show } = useToast();

  const convocados = useMemo(() => ordenarConvocados(alunos.filter((a) => a.status === "convocado")), [alunos]);

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
    setAlunos((atual) =>
      atual.map((a) =>
        a.id === alunoId ? { ...a, status: "aprovado", aprovadoPor: autorizadoPor, aprovadoEm: new Date().toISOString() } : a,
      ),
    );
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
      title="Novos Alunos"
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

      <Card title={`Convocados (${convocados.length})`}>
        {convocados.length === 0 ? (
          <p className="muted">Nenhum convocado aguardando comparecimento nesta unidade.</p>
        ) : (
          <>
            <div className="aluno-grid">
              {paginar(convocados, paginaConvocados, TAMANHO_PAGINA_GALERIA).map((a) => (
                <CardConvocado key={a.id} aluno={a} onAvancar={setAlunoEmFluxo} />
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
                      <Pill tone="ok">Aprovado</Pill>
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

      {alunoEmFluxo && (
        <AvancarFluxoWizard aluno={alunoEmFluxo} onFechar={() => setAlunoEmFluxo(null)} onAprovado={aoAprovar} onPrazoAdiado={aoAdiarPrazo} />
      )}
      <Toast message={message} />
    </Page>
  );
}
