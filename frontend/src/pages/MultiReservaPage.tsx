import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { getMultiReserva } from "../api/client";
import type { MultiReservaItem } from "../api/types";
import { Page, Card, DataTable, Spinner, ErrorBox, EmptyState, Pill, fmtInt, fmtHoras, fmtQuando } from "../design-system";
import { UnidadeSelect } from "../components/Filters";
import { useArea } from "../areas/AreaContext";

const PAGE_SIZE = 25;

export default function MultiReservaPage() {
  const [sp, setSp] = useSearchParams();
  const { cre, base } = useArea();
  const unidade = sp.get("unidade") ?? "";

  const q = useQuery({
    queryKey: ["multireserva", { cre, unidade }],
    queryFn: () => getMultiReserva({ cre: cre || undefined, unidade: unidade || undefined, limit: 500 }),
    refetchInterval: 60_000,
  });

  function setUnidade(v: string) {
    const next = new URLSearchParams(sp);
    if (v) next.set("unidade", v);
    else next.delete("unidade");
    setSp(next, { replace: true });
  }

  return (
    <Page
      title={cre ? `Crianças com várias reservas · ${cre}ª CRE` : "Crianças com várias reservas"}
      subtitle="Cada uma segura mais de uma vaga ao mesmo tempo. Quando a família confirma em uma unidade, as outras são liberadas na hora — vale avisar estas primeiro."
    >
      {!cre && (
        <div className="alert alert-info">
          <strong>Escolha a sua CRE</strong> no menu azul acima para ver só o seu território.
        </div>
      )}
      <div className="filters">
        <UnidadeSelect value={unidade} onChange={setUnidade} cre={cre} />
      </div>
      <Card flush secao="cre.multireserva">
        {q.isLoading && <Spinner label="Procurando crianças com mais de uma reserva…" />}
        {q.isError && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={q.error} />
          </div>
        )}
        {q.data && q.data.length === 0 && (
          <EmptyState title="Nenhuma criança com mais de uma reserva aberta neste recorte">
            <p>Ou as famílias já responderam, ou a classificação deu uma vaga por criança.</p>
          </EmptyState>
        )}
        {q.data && q.data.length > 0 && (
          <DataTable<MultiReservaItem>
            rows={q.data}
            pageSize={PAGE_SIZE}
            rowKey={(m) => m.inscricao_id}
            rowClass={(m) => (m.horas_mais_antiga >= 72 ? "row-danger" : m.horas_mais_antiga >= 48 ? "row-warn" : undefined)}
            columns={[
              {
                key: "crianca",
                header: "Criança",
                render: (m) => <Link to={`${base}/inscricoes/${m.inscricao_id}`}>{m.aluno_anon ?? `inscrição #${m.inscricao_id}`}</Link>,
              },
              { key: "pts", header: "Pontos", numeric: true, render: (m) => m.pontuacao, sortValue: (m) => m.pontuacao },
              {
                key: "n",
                header: "Reservas abertas",
                numeric: true,
                render: (m) => <Pill tone={m.n_abertas >= 3 ? "warn" : "info"}>{fmtInt(m.n_abertas)}</Pill>,
                sortValue: (m) => m.n_abertas,
              },
              { key: "unidades", header: "Unidades", render: (m) => m.unidades.join(" · ") },
              {
                key: "espera",
                header: "Segurando há",
                render: (m) => (
                  <span title={fmtQuando(m.mais_antiga_em)} className="tabular">
                    {fmtHoras(m.horas_mais_antiga)}
                  </span>
                ),
                sortValue: (m) => m.horas_mais_antiga,
              },
            ]}
            footer={<span>{fmtInt(q.data.length)} criança(s) · da que espera há mais tempo para a mais recente</span>}
          />
        )}
      </Card>
    </Page>
  );
}
