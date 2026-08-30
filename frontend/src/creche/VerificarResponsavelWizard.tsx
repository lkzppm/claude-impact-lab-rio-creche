import { useState } from "react";
import { Button } from "../design-system";
import { Responsavel } from "./mock";

function salvarIrmaoNaRede(responsavelId: string, valor: boolean) {
  // TODO: PATCH /api/v1/responsaveis/{responsavelId} { irmao_na_rede: valor }
  // grava na tabela `responsavel` (a modelar) — hoje é só um valor local de exemplo.
  console.info("salvarIrmaoNaRede", responsavelId, valor);
}

function salvarPequenosCariocas(responsavelId: string, valor: boolean) {
  // TODO: PATCH /api/v1/responsaveis/{responsavelId} { pequenos_cariocas: valor }
  console.info("salvarPequenosCariocas", responsavelId, valor);
}

function concluirVerificacao(responsavelId: string) {
  // TODO: PATCH /api/v1/responsaveis/{responsavelId} { documentos_verificados: true, verificado_em, verificado_por }
  const RESULTADO_VERIFICACAO_EXEMPLO = { documentos_verificados: true };
  console.info("concluirVerificacao", responsavelId, RESULTADO_VERIFICACAO_EXEMPLO);
  return RESULTADO_VERIFICACAO_EXEMPLO;
}

export function VerificarResponsavelWizard({
  responsaveis,
  preselecionadoId,
  onFechar,
  onVerificado,
}: {
  responsaveis: Responsavel[];
  preselecionadoId?: string | null;
  onFechar: () => void;
  onVerificado: (responsavelId: string) => void;
}) {
  const preselecionado = responsaveis.find((r) => r.id === preselecionadoId) ?? null;
  const [responsavelId, setResponsavelId] = useState(preselecionado?.id ?? "");
  const [busca, setBusca] = useState(preselecionado?.nome ?? "");
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [irmaoNaRede, setIrmaoNaRede] = useState(preselecionado?.irmaoNaRede ?? false);
  const [pequenosCariocas, setPequenosCariocas] = useState(preselecionado?.pequenosCariocas ?? false);

  const responsavel = responsaveis.find((r) => r.id === responsavelId);
  const jaVerificado = responsavel?.statusVerificacao === "verificado";

  const termo = busca.trim().toLowerCase();
  const sugestoes = termo.length > 0 ? responsaveis.filter((r) => r.nome.toLowerCase().includes(termo)).slice(0, 8) : [];

  function aoDigitarNome(valor: string) {
    setBusca(valor);
    setSugestoesAbertas(true);
    // se o texto não corresponder mais ao responsável já escolhido, desfaz a seleção
    if (responsavel && responsavel.nome !== valor) setResponsavelId("");
  }

  function escolher(r: Responsavel) {
    setResponsavelId(r.id);
    setBusca(r.nome);
    setSugestoesAbertas(false);
    // já verificado: mostra o que foi preenchido; pendente: começa do zero
    setIrmaoNaRede(r.irmaoNaRede ?? false);
    setPequenosCariocas(r.pequenosCariocas ?? false);
  }

  function concluir() {
    if (!responsavel) return;
    concluirVerificacao(responsavel.id);
    onVerificado(responsavel.id);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onFechar}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="verif-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="verif-title" style={{ fontSize: "var(--fs-lg)" }}>
          {jaVerificado ? "Responsável já verificado" : "Verificar responsável"}
        </h2>

        <label className="field" style={{ position: "relative" }}>
          <span>Nome do responsável</span>
          <input
            value={busca}
            onChange={(e) => aoDigitarNome(e.target.value)}
            onFocus={() => setSugestoesAbertas(true)}
            onBlur={() => setTimeout(() => setSugestoesAbertas(false), 120)}
            placeholder="Digite para buscar…"
            autoComplete="off"
          />
          {sugestoesAbertas && termo.length > 0 && (
            <ul className="autocomplete-list" role="listbox">
              {sugestoes.length === 0 ? (
                <li className="autocomplete-empty">Nenhum responsável encontrado</li>
              ) : (
                sugestoes.map((r) => (
                  <li key={r.id} role="option" aria-selected={r.id === responsavelId}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(r)}>
                      {r.nome} — {r.crianca}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </label>

        {responsavel && jaVerificado && (
          <div className="stack" style={{ gap: "var(--sp-2)" }}>
            <p className="text-sm muted">Este responsável já foi verificado. Abaixo está o que foi preenchido na época.</p>
            <div className={`wizard-check readonly ${irmaoNaRede ? "checked" : ""}`}>
              <span aria-hidden="true">{irmaoNaRede ? "✓" : "—"}</span>
              <span>Criança tem irmão na rede: {irmaoNaRede ? "Sim" : "Não"}</span>
            </div>
            <div className={`wizard-check readonly ${pequenosCariocas ? "checked" : ""}`}>
              <span aria-hidden="true">{pequenosCariocas ? "✓" : "—"}</span>
              <span>Criança está no programa Pequenos Cariocas: {pequenosCariocas ? "Sim" : "Não"}</span>
            </div>
          </div>
        )}

        {responsavel && !jaVerificado && (
          <div className="stack" style={{ gap: "var(--sp-2)" }}>
            <label className={`wizard-check ${irmaoNaRede ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={irmaoNaRede}
                onChange={(e) => {
                  setIrmaoNaRede(e.target.checked);
                  salvarIrmaoNaRede(responsavel.id, e.target.checked);
                }}
              />
              <span>Criança tem irmão na rede</span>
            </label>
            <label className={`wizard-check ${pequenosCariocas ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={pequenosCariocas}
                onChange={(e) => {
                  setPequenosCariocas(e.target.checked);
                  salvarPequenosCariocas(responsavel.id, e.target.checked);
                }}
              />
              <span>Criança está no programa Pequenos Cariocas</span>
            </label>
          </div>
        )}

        <div className="dialog-actions">
          {jaVerificado ? (
            <Button onClick={onFechar}>Fechar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onFechar}>
                Cancelar
              </Button>
              <Button disabled={!responsavel} onClick={concluir}>
                Concluir verificação
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
