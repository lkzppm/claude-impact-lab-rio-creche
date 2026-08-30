import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getInscricoes, getUnidades } from "../api/client";
import type { Inscricao } from "../api/types";
import { Combobox } from "./Combobox";
import type { OpcaoBusca } from "./Combobox";

/** CREs do município (1ª a 11ª). Valores enviados como string. */
export const CRES = Array.from({ length: 11 }, (_, i) => String(i + 1));

export function CreSelect({
  value,
  onChange,
  label = "CRE",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todas</option>
        {CRES.map((c) => (
          <option key={c} value={c}>
            {c}ª CRE
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Busca da unidade. A rede tem cerca de 2 mil escolas — um `<select>` com essa lista é impossível de
 * usar, então aqui se digita o nome (ou o bairro, ou o código) e as unidades mais próximas do que foi
 * escrito aparecem logo abaixo.
 */
export function UnidadeSelect({
  value,
  onChange,
  cre,
  label = "Unidade",
}: {
  value: string;
  onChange: (v: string) => void;
  cre?: string;
  label?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["unidades", { cre: cre || undefined, limit: 2000 }],
    queryFn: () => getUnidades({ cre: cre || undefined, limit: 2000 }),
  });
  const opcoes = useMemo<OpcaoBusca[]>(
    () =>
      (data ?? []).map((u) => ({
        valor: u.codigo,
        rotulo: u.nome ?? u.codigo,
        detalhe: [u.bairro, u.tipo, u.cre ? `${u.cre}ª CRE` : null, u.codigo].filter(Boolean).join(" · "),
      })),
    [data],
  );
  return (
    <Combobox
      label={label}
      value={value}
      onChange={onChange}
      opcoes={opcoes}
      carregando={isLoading}
      todosLabel="Todas as unidades"
      placeholder="nome, bairro ou código"
      vazio="Nenhuma unidade com esse nome"
      minWidth={300}
    />
  );
}

/**
 * Busca de uma criança pelo identificador que a base tem. A base da SME é anonimizada (spec/03): não
 * existe nome civil, e sim o código estável da criança (`aluno_0167497`) e o do responsável. Dá para
 * buscar também pelo bairro ou pelo número da inscrição. A consulta vai ao servidor a cada pausa na
 * digitação, com o recorte da CRE quando há uma escolhida.
 */
export function BuscaCrianca({
  cre,
  ano,
  onEscolher,
  label = "Buscar criança",
}: {
  cre?: string;
  ano?: number;
  onEscolher: (i: Inscricao) => void;
  label?: string;
}) {
  const [texto, setTexto] = useState("");
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTermo(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const habilitada = termo.length >= 3;
  const { data, isFetching } = useQuery({
    queryKey: ["inscricoes-busca", { termo, cre: cre || undefined, ano }],
    queryFn: () => getInscricoes({ q: termo, cre: cre || undefined, ano, page: 1, size: 8 }),
    enabled: habilitada,
  });
  const achados = data?.items ?? [];

  return (
    <div className="field combo" style={{ minWidth: 300 }}>
      <label htmlFor="busca-crianca">
        <span>{label}</span>
      </label>
      <div className="combo-campo">
        <Search size={16} aria-hidden="true" className="combo-lupa" />
        <input
          id="busca-crianca"
          ref={inputRef}
          type="search"
          autoComplete="off"
          value={texto}
          placeholder="código da criança, do responsável ou nº da inscrição"
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 140)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberto(false);
            if (e.key === "Enter" && achados.length === 1) onEscolher(achados[0]);
          }}
        />
      </div>
      {aberto && texto.trim().length > 0 && (
        <ul className="combo-lista" role="listbox" aria-label={label}>
          {!habilitada && <li className="autocomplete-empty">Digite ao menos 3 caracteres</li>}
          {habilitada && isFetching && achados.length === 0 && <li className="autocomplete-empty">Procurando…</li>}
          {habilitada && !isFetching && achados.length === 0 && (
            <li className="autocomplete-empty">Nenhuma criança encontrada{cre ? ` na ${cre}ª CRE` : ""}</li>
          )}
          {achados.map((i) => (
            <li key={i.id} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onEscolher(i)}>
                <span>{i.aluno_anon ?? `inscrição #${i.id}`}</span>
                <small>
                  #{i.id} · {i.ano} · {i.bairro ?? "bairro não informado"} · {i.pontuacao} ponto(s)
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const GRUPAMENTOS = ["Berçário", "Maternal I", "Maternal II"];
export const HORARIOS = ["Integral", "Parcial"];
