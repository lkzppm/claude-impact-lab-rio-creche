import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { ApiError, perguntarAssistente } from "../api/client";
import type { ChatFerramenta } from "../api/types";
import { useArea } from "../areas/AreaContext";
import { Button, Spinner } from "../design-system";

/**
 * "Perguntar ao painel" — assistente com ferramentas de consulta ao banco (POST /chat).
 * Só nas áreas CRE e Nível Central. O estado da conversa fica aqui, no cliente: o histórico inteiro vai a
 * cada turno. O assistente só lê; toda consulta que ele fez aparece numa linha discreta ("consultou: …").
 */

const SUGESTOES: Record<"cre" | "sme", string[]> = {
  cre: [
    "Quais convocações vencem hoje na minha CRE?",
    "Quantas famílias ainda não foram avisadas?",
    "Qual unidade tem mais vagas em risco?",
  ],
  sme: [
    "Qual CRE tem mais convocações em atraso?",
    "Compare as rodadas de 1 e 3 reservas",
    "Quantas crianças estão em lista de espera na rede?",
  ],
};

interface Balao {
  role: "user" | "assistant";
  content: string;
  ferramentas?: ChatFerramenta[];
  /** mensagem de erro do sistema: não vai para o histórico enviado ao modelo */
  erro?: boolean;
}

/** Texto do assistente → parágrafos, listas e negrito. Sem HTML: só nós React. */
function renderTexto(texto: string): ReactNode {
  const blocos = texto.split(/\n\s*\n/);
  return blocos.map((bloco, i) => {
    const linhas = bloco.split("\n").filter((l) => l.trim() !== "");
    const ehLista = linhas.length > 0 && linhas.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l));
    if (ehLista) {
      const numerada = /^\s*\d+[.)]\s+/.test(linhas[0]);
      const itens = linhas.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-•*]|\d+[.)])\s+/, ""))}</li>);
      return numerada ? <ol key={i}>{itens}</ol> : <ul key={i}>{itens}</ul>;
    }
    return (
      <p key={i}>
        {linhas.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {inline(l)}
          </span>
        ))}
      </p>
    );
  });
}

function inline(l: string): ReactNode {
  const partes = l.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, k) => (p.startsWith("**") && p.endsWith("**") ? <strong key={k}>{p.slice(2, -2)}</strong> : p));
}

export default function ChatAssistente() {
  const { area, cre } = useArea();
  const [aberto, setAberto] = useState(false);
  const [historico, setHistorico] = useState<Balao[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // o escopo muda com a área ou a CRE: a conversa recomeça
  useEffect(() => {
    setHistorico([]);
    setIndisponivel(false);
  }, [area, cre]);

  useEffect(() => {
    if (aberto) fim.current?.scrollIntoView({ block: "end" });
  }, [historico, carregando, aberto]);

  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  if (area !== "cre" && area !== "sme") return null;
  const areaAtual: "cre" | "sme" = area;
  const precisaCre = areaAtual === "cre" && !cre;
  const rotulo = areaAtual === "cre" ? (cre ? `${cre}ª CRE` : "CRE") : "Nível Central";

  async function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || carregando || precisaCre || indisponivel) return;
    const novo: Balao[] = [...historico, { role: "user", content: p }];
    setHistorico(novo);
    setTexto("");
    setCarregando(true);
    try {
      const r = await perguntarAssistente({
        area: areaAtual,
        cre: areaAtual === "cre" ? cre : undefined,
        ator: areaAtual === "cre" ? `polo-cre-${cre}` : "nivel-central",
        mensagens: novo.filter((b) => !b.erro).map(({ role, content }) => ({ role, content })),
      });
      setHistorico([...novo, { role: "assistant", content: r.resposta, ferramentas: r.ferramentas }]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setIndisponivel(true);
        setHistorico(historico);
        setTexto(p);
        return;
      }
      const msg =
        e instanceof ApiError && e.status === 429
          ? "O assistente está recebendo muitas perguntas agora. Tente de novo em alguns segundos."
          : e instanceof ApiError && e.status === 504
            ? "O assistente demorou demais para responder. Tente uma pergunta mais específica."
            : e instanceof Error
              ? `Não foi possível responder agora. ${e.message}`
              : "Não foi possível responder agora.";
      setHistorico([...novo, { role: "assistant", content: msg, erro: true }]);
    } finally {
      setCarregando(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar(texto);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn-primary chat-fab" onClick={() => setAberto(true)} aria-haspopup="dialog">
        <MessageCircle size={18} aria-hidden="true" /> Perguntar ao painel
      </button>
    );
  }

  return (
    <aside className="chat-panel" role="dialog" aria-label="Assistente do painel">
      <div className="chat-head">
        <div>
          <strong>Perguntar ao painel</strong>
          <span className="chat-head-sub">{rotulo} · só consulta, não altera nada</span>
        </div>
        <button type="button" className="chat-fechar" onClick={() => setAberto(false)} aria-label="Fechar o assistente">
          ×
        </button>
      </div>

      <div className="chat-body" aria-live="polite">
        {indisponivel && (
          <div className="alert alert-info">
            <strong>O assistente não está configurado nesta instalação.</strong> O painel continua funcionando normalmente. Para
            ativar, configure <code>ANTHROPIC_API_KEY</code> no backend.
          </div>
        )}
        {precisaCre && !indisponivel && (
          <div className="alert alert-info">
            <strong>Escolha a sua CRE</strong> no menu azul acima. O assistente responde só sobre o seu território.
          </div>
        )}
        {historico.length === 0 && !indisponivel && !precisaCre && (
          <div className="chat-intro">
            <p className="text-sm muted">
              Pergunte em português sobre convocações, prazos, vagas, unidades e inscrições. Eu consulto o painel e digo de onde veio
              cada número.
            </p>
            <div className="chat-sugestoes">
              {SUGESTOES[areaAtual].map((s) => (
                <button key={s} type="button" className="chat-sugestao" onClick={() => void enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {historico.map((b, i) => (
          <div key={i} className={`chat-msg chat-msg-${b.role} ${b.erro ? "chat-msg-erro" : ""}`.trim()}>
            {b.role === "assistant" ? renderTexto(b.content) : <p>{b.content}</p>}
            {b.ferramentas && b.ferramentas.length > 0 && (
              <ul className="chat-tools" aria-label="Consultas feitas">
                {b.ferramentas.map((f, j) => (
                  <li key={j} className={f.erro ? "chat-tool-erro" : undefined} title={f.erro ?? JSON.stringify(f.argumentos)}>
                    {f.erro ? "tentou" : "consultou"}: {f.resumo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {carregando && <Spinner label="Consultando o painel…" />}
        <div ref={fim} />
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={precisaCre ? "Escolha a CRE para perguntar" : "Escreva a sua pergunta…"}
          disabled={carregando || precisaCre || indisponivel}
          aria-label="Sua pergunta"
          maxLength={4000}
        />
        <Button type="submit" disabled={carregando || precisaCre || indisponivel || !texto.trim()}>
          Enviar
        </Button>
      </form>
      <p className="chat-nota">O assistente lê o painel; ele não registra contato, não confirma matrícula e não muda a pontuação.</p>
    </aside>
  );
}
