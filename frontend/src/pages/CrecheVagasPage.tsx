import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ApiError, informarCapacidade } from "../api/client";
import { Page, Card, Button, DataTable, Pill, fmtDateTime } from "../design-system";
import {
  ANO_PROCESSO_EXEMPLO,
  FILA_ESPERA_EXEMPLO,
  HORARIO_EXEMPLO,
  PERIODO_GESTAO_VAGA_ABERTO,
  PRAZO_GESTAO_VAGAS,
  SEGMENTO_LABEL,
  Segmento,
  UNIDADE_EXEMPLO,
  VAGAS_POR_SEGMENTO,
  proximosDaFila,
} from "../creche/mock";
import { adicionarManual, removerManual, useEventosRecentes, useOcupacaoPorSegmento } from "../creche/ocupacaoStore";

/**
 * `PUT /unidades/{codigo}/capacidade` já existe e é exatamente isto: a unidade informando o
 * número real de vagas (`fonte: "informada"`, `backend/app/routers/unidades.py`). `segmento` deste
 * painel é o `grupamento` da tabela `capacidade`; `horario` é fixo no exemplo (`HORARIO_EXEMPLO`)
 * porque esta tela ainda não escolhe turno. Falha de rede/404 (unidade de exemplo não existe na
 * base real) não deve travar a edição local — por isso o erro só é logado.
 */
async function salvarVagas(segmento: Segmento, vagas: number) {
  try {
    await informarCapacidade(UNIDADE_EXEMPLO.codigo, {
      ano: ANO_PROCESSO_EXEMPLO, grupamento: segmento, horario: HORARIO_EXEMPLO, vagas, ator: "painel-creche",
    });
  } catch (erro) {
    console.warn("salvarVagas: não foi possível gravar no backend", erro instanceof ApiError ? erro.message : erro);
  }
}

function SegmentoCard({
  segmento,
  vagasIniciais,
  editavel,
}: {
  segmento: Segmento;
  vagasIniciais: number;
  editavel: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [vagas, setVagas] = useState(vagasIniciais);
  const [rascunho, setRascunho] = useState(String(vagasIniciais));
  const [adicionando, setAdicionando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const ocupacao = useOcupacaoPorSegmento();
  const ocupadas = ocupacao[segmento];
  const recentes = useEventosRecentes(segmento);

  function confirmarAdicao() {
    const nome = nomeNovo.trim();
    if (!nome) return;
    adicionarManual(segmento, nome);
    setNomeNovo("");
    setAdicionando(false);
  }

  function ajustar(delta: number) {
    setVagas((v) => {
      const n = Math.max(0, v + delta);
      salvarVagas(segmento, n);
      setRascunho(String(n));
      return n;
    });
  }

  function salvar() {
    const n = Number(rascunho);
    if (Number.isFinite(n) && n >= 0) {
      setVagas(n);
      salvarVagas(segmento, n);
    }
    setEditando(false);
  }

  return (
    <Card title={SEGMENTO_LABEL[segmento]}>
      <div className="vaga-stepper">
        <button
          type="button"
          className="vaga-stepper-btn"
          aria-label={`Remover uma vaga de ${SEGMENTO_LABEL[segmento]}`}
          disabled={!editavel || vagas <= 0}
          onClick={() => ajustar(-1)}
        >
          −
        </button>
        <span className="stat-value vaga-stepper-valor">{vagas}</span>
        <button
          type="button"
          className="vaga-stepper-btn"
          aria-label={`Adicionar uma vaga em ${SEGMENTO_LABEL[segmento]}`}
          disabled={!editavel}
          onClick={() => ajustar(1)}
        >
          +
        </button>
      </div>

      {!editando ? (
        <Button variant="secondary" size="sm" disabled={!editavel} onClick={() => setEditando(true)}>
          Editar número exato
        </Button>
      ) : (
        <div className="row">
          <input
            type="number"
            min={0}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            style={{ width: 100, padding: "8px 12px", border: "1px solid var(--mr-grey-300)", borderRadius: "var(--radius-sm)" }}
          />
          <Button size="sm" onClick={salvar}>
            Salvar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      )}

      <div className="vaga-ocupadas">
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <span className="text-sm muted">Vagas ocupadas</span>
          <Pill tone={ocupadas >= vagas ? "danger" : "ok"}>
            {ocupadas} de {vagas}
          </Pill>
        </div>

        {!adicionando ? (
          <Button variant="ghost" size="sm" onClick={() => setAdicionando(true)}>
            + Adicionar aluno fora do sistema
          </Button>
        ) : (
          <div className="row" style={{ gap: 6 }}>
            <input
              autoFocus
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmarAdicao()}
              placeholder="Nome do aluno"
              style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--mr-grey-300)", borderRadius: "var(--radius-sm)" }}
            />
            <Button size="sm" disabled={!nomeNovo.trim()} onClick={confirmarAdicao}>
              Adicionar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setAdicionando(false); setNomeNovo(""); }}>
              Cancelar
            </Button>
          </div>
        )}

        {recentes.length > 0 && (
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <span className="text-sm muted">Hoje e ontem</span>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {recentes.map((e) => (
                <li key={e.id} className="row" style={{ alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                  <span className="text-sm">
                    {e.nome} <span className="muted">({e.ocupadasAntes} → {e.ocupadasDepois})</span>
                    {e.origem === "manual" && <Pill tone="warn">fora do sistema</Pill>}
                  </span>
                  {e.origem === "manual" && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removerManual(e.id)}>
                      Retirar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function CrecheVagasPage() {
  const [filaAberta, setFilaAberta] = useState(false);
  const fila = proximosDaFila(FILA_ESPERA_EXEMPLO, UNIDADE_EXEMPLO.codigo);

  return (
    <Page
      title="Administração de Vagas"
      subtitle="Número de vagas por segmento de entrada. A edição só fica disponível durante o período de gestão de vaga."
    >
      <div className="alert alert-warn" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <p style={{ margin: 0 }}>
          As matrículas aprovadas pelo sistema hoje já são somadas automaticamente em "Vagas ocupadas" — não
          lance-as aqui de novo. Use os botões <strong>−1 / +1</strong> só para corrigir manualmente: uma criança
          que entrou fora do sistema, ou uma mudança no número de vagas informada pela CRE.
        </p>
      </div>

      {!PERIODO_GESTAO_VAGA_ABERTO && (
        <div className="alert alert-danger">
          <strong>Período de gestão de vaga fechado.</strong> A edição está bloqueada — fale com a CRE/polo se precisar
          corrigir o número de vagas fora do prazo.
        </div>
      )}

      <div className="grid-tiles">
        {VAGAS_POR_SEGMENTO.map((v) => (
          <SegmentoCard key={v.segmento} segmento={v.segmento} vagasIniciais={v.vagas} editavel={PERIODO_GESTAO_VAGA_ABERTO} />
        ))}
      </div>

      <Card title="Prazo">
        <p>
          Data limite para editar a gestão de vagas: <strong>{fmtDateTime(PRAZO_GESTAO_VAGAS)}</strong>
        </p>
        <p className="text-sm muted">Valor de exemplo — em produção vem do processo do ano corrente no banco.</p>
      </Card>

      <Card
        title="Fila de espera"
        flush
        actions={
          <Button variant="secondary" size="sm" onClick={() => setFilaAberta((v) => !v)}>
            {filaAberta ? "Ocultar fila de espera" : "Ver fila de espera"}
          </Button>
        }
      >
        {!filaAberta ? (
          <p className="text-sm muted" style={{ padding: "0 24px 16px" }}>
            Ao final do ciclo de cadastro, quem não recebeu vaga entra na fila de espera desta unidade. Mostra
            os {fila.length < 10 ? fila.length : "10"} primeiros.
          </p>
        ) : fila.length === 0 ? (
          <p className="text-sm muted" style={{ padding: "0 24px 16px" }}>
            Ninguém na fila de espera desta unidade no momento.
          </p>
        ) : (
          <DataTable
            rows={fila}
            rowKey={(i) => i.posicao}
            columns={[
              { key: "posicao", header: "#", render: (i) => <strong>{i.posicao}º</strong> },
              { key: "crianca", header: "Criança", render: (i) => i.crianca },
              { key: "segmento", header: "Segmento", render: (i) => SEGMENTO_LABEL[i.segmento] },
              { key: "responsavel", header: "Responsável", render: (i) => i.responsavel },
              { key: "telefone", header: "Telefone", render: (i) => i.telefone },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}
