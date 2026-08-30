import { useQuery } from "@tanstack/react-query";
import { getUnidades } from "../api/client";

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
  const { data } = useQuery({
    queryKey: ["unidades", { cre: cre || undefined, limit: 2000 }],
    queryFn: () => getUnidades({ cre: cre || undefined, limit: 2000 }),
  });
  const list = data ?? [];
  return (
    <label className="field" style={{ minWidth: 260 }}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todas</option>
        {list.map((u) => (
          <option key={u.codigo} value={u.codigo}>
            {u.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

export const GRUPAMENTOS = ["Berçário", "Maternal I", "Maternal II"];
export const HORARIOS = ["Integral", "Parcial"];
