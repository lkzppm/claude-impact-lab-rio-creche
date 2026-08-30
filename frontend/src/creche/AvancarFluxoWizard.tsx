import { useState } from "react";
import { registrarEvento } from "../api/client";
import { Button } from "../design-system";
import { NovoAluno } from "./mock";

type Acao = "aprovar" | "adiar";

/**
 * `POST /convocacoes/{id}/eventos` com `tipo: "confirmada"` já é a transição real de aprovação
 * (`backend/app/routers/convocacoes.py::TRANSICOES`) — o "servidor que autorizou" vai no `payload`
 * do evento append-only, não em uma coluna própria (não existe uma).
 *
 * `alunoId` precisa ser o id numérico de `convocacao`; os dados de exemplo deste painel usam ids
 * de mock ("a1"...) até existir seed real de convocação para uma unidade de creche/EDI — nesse caso
 * a chamada é pulada e só o estado local muda (ver `onAprovado` em `CrecheNovosAlunosPage`).
 */
async function aprovarMatricula(alunoId: string, autorizadoPor: string) {
  const id = Number(alunoId);
  if (!Number.isInteger(id)) {
    console.info("aprovarMatricula (mock, sem convocação real)", alunoId, autorizadoPor);
    return;
  }
  return registrarEvento(id, { tipo: "confirmada", ator: autorizadoPor, payload: { autorizado_por: autorizadoPor } });
}

/**
 * Não existe transição "adiar prazo" isolada na máquina de estados real — o prazo só é reiniciado
 * (+3 dias) quando a convocação entra em `contato_confirmado` (`_aplicar_transicao`, linha ~119).
 * Reaproveitamos essa transição: "ainda não compareceu, mas a família confirmou que vem" é
 * exatamente o que `contato_confirmado` significa no cronograma real.
 */
async function adiarPrazoComparecimento(alunoId: string) {
  const id = Number(alunoId);
  if (!Number.isInteger(id)) {
    console.info("adiarPrazoComparecimento (mock, sem convocação real)", alunoId);
    return;
  }
  return registrarEvento(id, { tipo: "contato_confirmado", ator: "painel-creche" });
}

export function AvancarFluxoWizard({
  aluno,
  onFechar,
  onAprovado,
  onPrazoAdiado,
}: {
  aluno: NovoAluno;
  onFechar: () => void;
  onAprovado: (alunoId: string, autorizadoPor: string) => void;
  onPrazoAdiado: (alunoId: string) => void;
}) {
  const [acao, setAcao] = useState<Acao>("aprovar");
  const [servidor, setServidor] = useState("");

  async function confirmar() {
    if (acao === "aprovar") {
      const nome = servidor.trim();
      if (!nome) return;
      await aprovarMatricula(aluno.id, nome);
      onAprovado(aluno.id, nome);
    } else {
      await adiarPrazoComparecimento(aluno.id);
      onPrazoAdiado(aluno.id);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onFechar}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="fluxo-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="fluxo-title" style={{ fontSize: "var(--fs-lg)" }}>
          Avançar fluxo — {aluno.nome}
        </h2>
        <p className="text-sm muted">
          Faltam {aluno.prazoDiasRestantes} dia(s) para o prazo de comparecimento. Escolha o que aconteceu.
        </p>

        <div className="stack" style={{ gap: "var(--sp-2)" }}>
          <label className={`wizard-check ${acao === "aprovar" ? "checked" : ""}`}>
            <input type="radio" name="acao" checked={acao === "aprovar"} onChange={() => setAcao("aprovar")} />
            <span>O responsável compareceu — aprovar a matrícula</span>
          </label>
          <label className={`wizard-check ${acao === "adiar" ? "checked" : ""}`}>
            <input type="radio" name="acao" checked={acao === "adiar"} onChange={() => setAcao("adiar")} />
            <span>Ainda não compareceu — adicionar 1 dia ao prazo</span>
          </label>
        </div>

        {acao === "aprovar" && (
          <label className="field">
            <span>Nome do servidor que autorizou</span>
            <input value={servidor} onChange={(e) => setServidor(e.target.value)} placeholder="ex.: Marcos Vieira" />
          </label>
        )}

        <div className="dialog-actions">
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={acao === "aprovar" && !servidor.trim()} onClick={confirmar}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
