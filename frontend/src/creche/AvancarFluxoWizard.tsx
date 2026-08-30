import { useState } from "react";
import { Button } from "../design-system";
import { NovoAluno } from "./mock";

type Acao = "aprovar" | "adiar";

function aprovarMatricula(alunoId: string, autorizadoPor: string) {
  // TODO: POST /api/v1/creche/novos-alunos/{alunoId}/aprovar { autorizado_por: autorizadoPor }
  // grava em `convocacao` (status -> confirmada) + `evento` (ator = servidor, payload com o nome)
  console.info("aprovarMatricula", alunoId, autorizadoPor);
}

function adiarPrazoComparecimento(alunoId: string) {
  // TODO: PATCH /api/v1/creche/novos-alunos/{alunoId} { prazo_dias_restantes: +1 }
  console.info("adiarPrazoComparecimento", alunoId);
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

  function confirmar() {
    if (acao === "aprovar") {
      const nome = servidor.trim();
      if (!nome) return;
      aprovarMatricula(aluno.id, nome);
      onAprovado(aluno.id, nome);
    } else {
      adiarPrazoComparecimento(aluno.id);
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
