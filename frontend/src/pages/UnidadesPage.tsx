import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { getUnidades } from "../api/client";
import type { Unidade } from "../api/types";
import { Page, Card, DataTable, Spinner, ErrorBox, EmptyState, fmtInt } from "../design-system";
import { CreSelect } from "../components/Filters";
import { useArea } from "../areas/AreaContext";

export default function UnidadesPage() {
  const navigate = useNavigate();
  const { area, base, cre: creArea } = useArea();
  const [creLocal, setCre] = useState("");
  const cre = area === "cre" ? creArea : creLocal;
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["unidades", { cre, q, limit: 2000 }],
    queryFn: () => getUnidades({ cre: cre || undefined, q: q || undefined, limit: 2000 }),
  });

  return (
    <Page title={area === "cre" && cre ? `Unidades da ${cre}ª CRE` : "Unidades"} subtitle="Creches e EDIs da rede, com endereço, CRE e capacidade estimada por grupamento e turno.">
      <div className="filters">
        <label className="field" style={{ minWidth: 280 }}>
          <span>Buscar</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome, bairro ou código" />
        </label>
        {area !== "cre" && <CreSelect value={cre} onChange={setCre} />}
      </div>
      <Card flush secao={area === "cre" ? "cre.unidades" : "sme.unidades"}>
        {query.isLoading && <Spinner label="Carregando unidades…" />}
        {query.isError && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={query.error} />
          </div>
        )}
        {query.data && query.data.length === 0 && <EmptyState title="Nenhuma unidade encontrada" />}
        {query.data && query.data.length > 0 && (
          <DataTable<Unidade>
            rows={query.data}
            rowKey={(u) => u.codigo}
            onRowClick={(u) => navigate(`${base}/unidades/${encodeURIComponent(u.codigo)}`)}
            columns={[
              {
                key: "nome",
                header: "Unidade",
                render: (u) => <Link to={`${base}/unidades/${encodeURIComponent(u.codigo)}`}>{u.nome}</Link>,
                sortValue: (u) => u.nome,
              },
              { key: "codigo", header: "Código", render: (u) => <code className="text-sm">{u.codigo}</code> },
              { key: "tipo", header: "Tipo", render: (u) => u.tipo ?? "—", sortValue: (u) => u.tipo ?? "" },
              { key: "bairro", header: "Bairro", render: (u) => u.bairro ?? "—", sortValue: (u) => u.bairro ?? "" },
              { key: "cre", header: "CRE", render: (u) => (u.cre ? `${u.cre}ª` : "—"), sortValue: (u) => u.cre ?? "" },
              { key: "polo", header: "Polo", render: (u) => u.polo ?? "—" },
            ]}
            footer={<span>{fmtInt(query.data.length)} unidade(s)</span>}
          />
        )}
      </Card>
    </Page>
  );
}
