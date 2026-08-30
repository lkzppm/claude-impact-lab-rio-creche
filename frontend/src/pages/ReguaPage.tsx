import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProcessos, getRegua } from "../api/client";
import type { Pergunta } from "../api/types";
import { Page, Card, DataTable, Spinner, ErrorBox, EmptyState, Pill, fmtInt } from "../design-system";

export default function ReguaPage() {
  const processos = useQuery({ queryKey: ["processos"], queryFn: getProcessos });
  const [ano, setAno] = useState<string>("");
  const anoEfetivo = ano || (processos.data && processos.data.length ? String(processos.data[processos.data.length - 1].ano) : "");
  const regua = useQuery({
    queryKey: ["regua", anoEfetivo],
    queryFn: () => getRegua(Number(anoEfetivo)),
    enabled: !!anoEfetivo,
  });

  const linhas = [...(regua.data ?? [])].sort((a, b) => (b.pontuacao - a.pontuacao) || ((a.ordem ?? 0) - (b.ordem ?? 0)));
  const total = linhas.reduce((s, p) => s + p.pontuacao, 0);

  return (
    <Page
      title="Régua de pontuação"
      subtitle="Os critérios e pesos que ordenam a fila em cada processo. Somente leitura."
    >
      <div className="alert alert-info">
        <strong>Norma, não parâmetro.</strong> A pontuação é definida por resolução da SME (a vigente é a Res. SME 542/2025, que rege o
        processo de 2026). O motor de classificação consome exatamente estes pesos; nada aqui é editável pelo sistema.
      </div>

      <div className="filters">
        <label className="field">
          <span>Processo</span>
          <select value={anoEfetivo} onChange={(e) => setAno(e.target.value)}>
            {(processos.data ?? []).map((p) => (
              <option key={p.ano} value={p.ano}>
                {p.ano} · processo {p.prm_id}
              </option>
            ))}
          </select>
        </label>
        {regua.data && (
          <span className="text-sm muted" style={{ alignSelf: "center" }}>
            {linhas.length} critérios · soma dos pesos {fmtInt(total)}
          </span>
        )}
      </div>

      <Card flush secao="sme.regua">
        {(processos.isLoading || regua.isLoading) && <Spinner label="Carregando a régua…" />}
        {regua.isError && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={regua.error} />
          </div>
        )}
        {regua.data && linhas.length === 0 && <EmptyState title="Sem perguntas para este processo" />}
        {regua.data && linhas.length > 0 && (
          <DataTable<Pergunta>
            rows={linhas}
            rowKey={(p) => p.ich_perg_id}
            columns={[
              { key: "ordem", header: "Ordem", numeric: true, render: (p) => p.ordem ?? "—", sortValue: (p) => p.ordem ?? 0 },
              { key: "texto", header: "Critério", render: (p) => p.texto },
              {
                key: "pontuacao",
                header: "Pontos",
                numeric: true,
                render: (p) => (p.criterio_desempate ? <Pill tone="neutral">desempate</Pill> : <strong className="tabular">{p.pontuacao}</strong>),
                sortValue: (p) => p.pontuacao,
              },
              { key: "perg_id", header: "Pergunta (id)", render: (p) => <code className="text-sm">{p.perg_id ?? "—"}</code> },
            ]}
            footer={<span>A régua muda a cada processo — entre 2023 e 2024 só 3 das 13 perguntas sobreviveram.</span>}
          />
        )}
      </Card>
    </Page>
  );
}
