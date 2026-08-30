import { useEffect, useState } from "react";
import { ApiError, confirmarResposta, getInscricao } from "../api/client";
import type { Resposta } from "../api/types";
import { Button } from "../design-system";
import { Responsavel } from "./mock";

/**
 * Verificação presencial de documento: chama-se TODO inscrito com algum critério pontuado — quem
 * não vem, o critério declarado continua contando na pontuação (ninguém perde ponto por faltar),
 * mas fica sem confirmação física, e é isso que alimenta o cronograma de atraso
 * (`fluxoAtrasoDocumento.ts`: dia 1 avisa, dia 3 os critérios saem da pontuação).
 *
 * As opções aqui **não são digitadas pela creche** — vêm de `GET /inscricoes/{id}` (`respostas`),
 * o que a família já marcou no formulário de inscrição. A creche só confere contra o documento
 * físico e confirma ou não cada item (`PATCH /inscricoes/{id}/respostas/{ich_perg_id}`).
 */
function concluirVerificacao(responsavelId: string) {
  // TODO: falta uma tabela `responsavel` para marcar `documentos_verificados`/`verificado_em` no
  // nível da unidade — hoje "verificado" só existe como status local deste painel (`mock.ts`); a
  // fonte de verdade real por critério já é `resposta.confirmado`, gravada acima.
  console.info("concluirVerificacao", responsavelId);
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
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const responsavel = responsaveis.find((r) => r.id === responsavelId);
  const jaVerificado = responsavel?.statusVerificacao === "verificado";

  const termo = busca.trim().toLowerCase();
  const sugestoes = termo.length > 0 ? responsaveis.filter((r) => r.nome.toLowerCase().includes(termo)).slice(0, 8) : [];

  useEffect(() => {
    if (!responsavel?.inscricaoId) {
      setRespostas([]);
      setErro(null);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    getInscricao(responsavel.inscricaoId)
      .then((i) => {
        if (!cancelado) setRespostas(i.respostas);
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as respostas da inscrição.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [responsavel?.inscricaoId]);

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
  }

  async function alternarConfirmacao(r: Resposta, confirmado: boolean) {
    if (!responsavel?.inscricaoId) return;
    setRespostas((atual) => atual.map((x) => (x.ich_perg_id === r.ich_perg_id ? { ...x, confirmado } : x)));
    try {
      await confirmarResposta(responsavel.inscricaoId, r.ich_perg_id, confirmado, "painel-creche");
    } catch (e) {
      setRespostas((atual) => atual.map((x) => (x.ich_perg_id === r.ich_perg_id ? { ...x, confirmado: !confirmado } : x)));
      setErro(e instanceof ApiError ? e.message : "Não foi possível gravar a confirmação.");
    }
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

        {responsavel && !responsavel.inscricaoId && (
          <p className="text-sm muted">
            Sem inscrição vinculada (dado de exemplo) — em produção as opções abaixo viriam da inscrição real
            da família (<code>GET /inscricoes/{"{id}"}</code>).
          </p>
        )}

        {responsavel && responsavel.inscricaoId && carregando && <p className="text-sm muted">Carregando respostas da inscrição…</p>}
        {erro && <p className="text-sm" style={{ color: "var(--danger)" }}>{erro}</p>}

        {responsavel && responsavel.inscricaoId && !carregando && respostas.length > 0 && (
          <div className="stack" style={{ gap: "var(--sp-2)" }}>
            <p className="text-sm muted">
              {jaVerificado
                ? "Este responsável já foi verificado. Abaixo está o que a família declarou e o que foi confirmado."
                : "Confira cada critério declarado pela família contra o documento físico e marque o que for comprovado."}
            </p>
            {respostas
              .filter((r) => r.resposta)
              .map((r) =>
                jaVerificado ? (
                  <div key={r.ich_perg_id} className={`wizard-check readonly ${r.confirmado ? "checked" : ""}`}>
                    <span aria-hidden="true">{r.confirmado ? "✓" : "—"}</span>
                    <span>{r.texto ?? `Critério #${r.ich_perg_id}`}</span>
                  </div>
                ) : (
                  <label key={r.ich_perg_id} className={`wizard-check ${r.confirmado ? "checked" : ""}`}>
                    <input type="checkbox" checked={r.confirmado} onChange={(e) => alternarConfirmacao(r, e.target.checked)} />
                    <span>{r.texto ?? `Critério #${r.ich_perg_id}`}</span>
                  </label>
                ),
              )}
          </div>
        )}

        {responsavel && responsavel.inscricaoId && !carregando && respostas.filter((r) => r.resposta).length === 0 && !erro && (
          <p className="text-sm muted">Esta inscrição não declarou nenhum critério pontuado para conferir.</p>
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
