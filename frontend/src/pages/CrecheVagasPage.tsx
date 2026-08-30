import { useState } from "react";
import { Page, Card, Button, fmtDateTime } from "../design-system";
import {
  PERIODO_GESTAO_VAGA_ABERTO,
  PRAZO_GESTAO_VAGAS,
  SEGMENTO_LABEL,
  Segmento,
  VAGAS_POR_SEGMENTO,
} from "../creche/mock";

function salvarVagas(segmento: Segmento, vagas: number) {
  // TODO: PATCH /api/v1/unidades/{codigo}/capacidade { segmento, vagas }
  // grava em `capacidade` (ano, unidade_codigo, grupamento, horario) — fonte: 'informada'
  console.info("salvarVagas", segmento, vagas);
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
    </Card>
  );
}

export default function CrecheVagasPage() {
  return (
    <Page
      title="Vagas da unidade"
      subtitle="Número de vagas por grupamento de entrada. A edição só fica disponível durante o período de gestão de vaga."
    >
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
    </Page>
  );
}
