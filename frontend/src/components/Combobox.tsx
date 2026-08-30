import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/** Uma opção da busca. `detalhe` é a segunda linha (bairro, código, CRE…) e também entra no casamento. */
export interface OpcaoBusca {
  valor: string;
  rotulo: string;
  detalhe?: string;
}

const LIMITE = 8;

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Ordena as opções pela proximidade com o que está sendo digitado, da mais perto para a mais longe:
 * começa com o termo > começa uma palavra > contém no rótulo > só bate no detalhe. Empate desfeito
 * pela posição do termo e depois pelo rótulo, para a lista não dançar entre teclas.
 */
export function ordenarPorProximidade(opcoes: OpcaoBusca[], termo: string, limite = LIMITE): OpcaoBusca[] {
  const t = normalizar(termo.trim());
  if (!t) return opcoes.slice(0, limite);
  const marcadas: { o: OpcaoBusca; peso: number; pos: number }[] = [];
  for (const o of opcoes) {
    const rot = normalizar(o.rotulo);
    const i = rot.indexOf(t);
    if (i === 0) marcadas.push({ o, peso: 0, pos: 0 });
    else if (i > 0) marcadas.push({ o, peso: /[\s·/-]/.test(rot[i - 1]) ? 1 : 2, pos: i });
    else {
      const det = normalizar(o.detalhe ?? "");
      const j = det.indexOf(t);
      if (j >= 0) marcadas.push({ o, peso: 3, pos: j });
    }
  }
  marcadas.sort((a, b) => a.peso - b.peso || a.pos - b.pos || a.o.rotulo.localeCompare(b.o.rotulo, "pt-BR"));
  return marcadas.slice(0, limite).map((m) => m.o);
}

/**
 * Campo de busca com sugestões — substitui o `<select>` quando a lista é longa demais para rolar
 * (as ~2 mil unidades da rede). Digitar filtra; as opções mais próximas aparecem logo abaixo, e as
 * setas + Enter escolhem sem tirar a mão do teclado.
 */
export function Combobox({
  label,
  value,
  onChange,
  opcoes,
  placeholder = "Digite para buscar…",
  todosLabel = "Todas",
  carregando = false,
  vazio = "Nada encontrado",
  minWidth = 280,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  opcoes: OpcaoBusca[];
  placeholder?: string;
  /** rótulo da opção que limpa o filtro; `null` esconde a linha (busca sem "todas") */
  todosLabel?: string | null;
  carregando?: boolean;
  vazio?: string;
  minWidth?: number;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const rotuloAtual = opcoes.find((o) => o.valor === value)?.rotulo ?? "";
  useEffect(() => setTexto(rotuloAtual), [rotuloAtual]);

  const buscando = texto.trim().length > 0 && texto !== rotuloAtual;
  const sugestoes = useMemo(
    () => (buscando ? ordenarPorProximidade(opcoes, texto) : opcoes.slice(0, LIMITE)),
    [buscando, opcoes, texto],
  );
  // "Todas" só faz sentido quando não se está buscando um nome
  const limpar = todosLabel !== null && !buscando;
  const linhas = limpar ? [{ valor: "", rotulo: todosLabel, detalhe: undefined }, ...sugestoes] : sugestoes;

  function escolher(o: OpcaoBusca | undefined) {
    if (!o) return;
    onChange(o.valor);
    setTexto(o.valor ? o.rotulo : "");
    setAberto(false);
    setAtivo(0);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => {
        const n = linhas.length;
        if (!n) return 0;
        return e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n;
      });
    } else if (e.key === "Enter") {
      if (aberto && linhas.length) {
        e.preventDefault();
        escolher(linhas[Math.min(ativo, linhas.length - 1)]);
      }
    } else if (e.key === "Escape") {
      setAberto(false);
      setTexto(rotuloAtual);
    }
  }

  return (
    <div className="field combo" style={{ minWidth }}>
      <label htmlFor={id}>
        <span>{label}</span>
      </label>
      <div className="combo-campo">
        <Search size={16} aria-hidden="true" className="combo-lupa" />
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          value={texto}
          placeholder={carregando ? "Carregando…" : placeholder}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
            setAtivo(0);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => {
            // o clique numa sugestão acontece depois do blur; o atraso deixa o onClick rodar
            setTimeout(() => {
              setAberto(false);
              setTexto((t) => (t === rotuloAtual ? t : rotuloAtual));
            }, 140);
          }}
          onKeyDown={aoTeclar}
        />
        {(value || texto) && (
          <button
            type="button"
            className="combo-limpar"
            aria-label={`Limpar ${label.toLowerCase()}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setTexto("");
              inputRef.current?.focus();
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {aberto && (
        <ul className="combo-lista" id={`${id}-lista`} role="listbox" aria-label={label}>
          {linhas.length === 0 && <li className="autocomplete-empty">{carregando ? "Carregando…" : vazio}</li>}
          {linhas.map((o, k) => (
            <li key={`${o.valor}-${k}`} role="option" aria-selected={o.valor === value}>
              <button
                type="button"
                className={k === ativo ? "combo-ativo" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(k)}
                onClick={() => escolher(o)}
              >
                <span>{o.rotulo}</span>
                {o.detalhe && <small>{o.detalhe}</small>}
              </button>
            </li>
          ))}
          {buscando && sugestoes.length === LIMITE && (
            <li className="autocomplete-empty">Mostrando as {LIMITE} mais próximas — refine a busca</li>
          )}
        </ul>
      )}
    </div>
  );
}
