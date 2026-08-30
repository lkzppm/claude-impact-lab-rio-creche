import { useMemo, useState } from "react";
import { Page, Card, Button, DataTable, Pill, Toast, Pagination, paginar, fmtDateTime } from "../design-system";
import { useToast } from "../components/useToast";
import { VerificarResponsavelWizard } from "../creche/VerificarResponsavelWizard";
import {
  PRAZO_VERIFICACAO_DOCUMENTO_DIAS,
  RESPONSAVEIS_EXEMPLO,
  Responsavel,
  TAMANHO_PAGINA_GALERIA,
  agendadosEstaSemana,
  emAtraso,
  verificados,
} from "../creche/mock";
import { ESTAGIO_ATRASO_LABEL, estagioAtraso, perdeuVagaHaMenosDe } from "../creche/fluxoAtrasoDocumento";

export default function CrecheDocumentosPage() {
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>(RESPONSAVEIS_EXEMPLO);
  const [buscaAtraso, setBuscaAtraso] = useState("");
  const [wizardAberto, setWizardAberto] = useState(false);
  const [preselecionado, setPreselecionado] = useState<string | null>(null);
  const [paginaAgendados, setPaginaAgendados] = useState(1);
  const [paginaAtraso, setPaginaAtraso] = useState(1);
  const [paginaVerificados, setPaginaVerificados] = useState(1);
  const { message, show } = useToast();

  const agendados = useMemo(() => agendadosEstaSemana(responsaveis), [responsaveis]);
  const atrasados = useMemo(() => {
    const termo = buscaAtraso.trim().toLowerCase();
    const base = emAtraso(responsaveis);
    return termo ? base.filter((r) => r.nome.toLowerCase().includes(termo)) : base;
  }, [responsaveis, buscaAtraso]);
  const jaVerificados = useMemo(() => verificados(responsaveis), [responsaveis]);
  const perderamVaga = useMemo(
    () => responsaveis.filter((r) => perdeuVagaHaMenosDe(r)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [responsaveis],
  );
  const [paginaPerdeuVaga, setPaginaPerdeuVaga] = useState(1);

  function abrirWizard(responsavelId?: string) {
    setPreselecionado(responsavelId ?? null);
    setWizardAberto(true);
  }

  function aoVerificar(responsavelId: string) {
    setResponsaveis((atual) =>
      atual.map((r) => (r.id === responsavelId ? { ...r, statusVerificacao: "verificado" } : r)),
    );
    setWizardAberto(false);
    show("Responsável verificado.");
  }

  return (
    <Page
      title="Verificação de Documentos"
      subtitle={`Passo anterior à convocação — prazo de ${PRAZO_VERIFICACAO_DOCUMENTO_DIAS} dia. Quem tem visita agendada essa semana aparece primeiro; quem passou do prazo cai para "Em atraso".`}
      actions={
        <Button onClick={() => abrirWizard()} disabled={responsaveis.length === 0}>
          Verificar usuário
        </Button>
      }
    >
      <Card title={`Agendados essa semana (${agendados.length})`} flush>
        {agendados.length === 0 ? (
          <div style={{ padding: 16 }} className="muted">
            Nenhuma visita agendada para os próximos 7 dias.
          </div>
        ) : (
          <DataTable
            rows={paginar(agendados, paginaAgendados, TAMANHO_PAGINA_GALERIA)}
            rowKey={(r) => r.id}
            columns={[
              { key: "nome", header: "Responsável", render: (r) => r.nome },
              { key: "crianca", header: "Criança", render: (r) => r.crianca },
              { key: "data", header: "Visita agendada", render: (r) => fmtDateTime(r.dataAgendada) },
              { key: "telefone", header: "Telefone", render: (r) => r.telefone },
              {
                key: "acao",
                header: "",
                render: (r) => (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirWizard(r.id)}>
                    Verificar
                  </button>
                ),
              },
            ]}
            footer={<Pagination page={paginaAgendados} pageSize={TAMANHO_PAGINA_GALERIA} total={agendados.length} onPageChange={setPaginaAgendados} />}
          />
        )}
      </Card>

      <Card title={`Em atraso (${atrasados.length})`} flush>
        <div style={{ padding: "16px 16px 0" }}>
          <label className="field">
            <span>Buscar por nome</span>
            <input
              value={buscaAtraso}
              onChange={(e) => {
                setBuscaAtraso(e.target.value);
                setPaginaAtraso(1);
              }}
              placeholder="ex.: Ana Paula"
            />
          </label>
        </div>
        {atrasados.length === 0 ? (
          <div style={{ padding: 16 }} className="muted">
            {buscaAtraso ? "Nenhum resultado para essa busca." : "Ninguém em atraso."}
          </div>
        ) : (
          <DataTable
            rows={paginar(atrasados, paginaAtraso, TAMANHO_PAGINA_GALERIA)}
            rowKey={(r) => r.id}
            columns={[
              { key: "nome", header: "Responsável", render: (r) => r.nome },
              { key: "crianca", header: "Criança", render: (r) => r.crianca },
              { key: "telefone", header: "Telefone", render: (r) => r.telefone },
              {
                key: "status",
                header: "Status",
                render: (r) => {
                  const estagio = r.diasAtraso != null ? estagioAtraso(r.diasAtraso) : null;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <Pill tone="danger">Em atraso{r.diasAtraso != null ? ` — ${r.diasAtraso}d` : ""}</Pill>
                      {estagio && <span className="text-sm muted">{ESTAGIO_ATRASO_LABEL[estagio]}</span>}
                    </div>
                  );
                },
              },
              {
                key: "acao",
                header: "",
                render: (r) => (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirWizard(r.id)}>
                    Verificar
                  </button>
                ),
              },
            ]}
            footer={<Pagination page={paginaAtraso} pageSize={TAMANHO_PAGINA_GALERIA} total={atrasados.length} onPageChange={setPaginaAtraso} />}
          />
        )}
      </Card>

      <Card title={`Verificados (${jaVerificados.length})`} flush>
        {jaVerificados.length === 0 ? (
          <div style={{ padding: 16 }} className="muted">
            Ninguém verificado ainda.
          </div>
        ) : (
          <DataTable
            rows={paginar(jaVerificados, paginaVerificados, TAMANHO_PAGINA_GALERIA)}
            rowKey={(r) => r.id}
            columns={[
              { key: "nome", header: "Responsável", render: (r) => r.nome },
              { key: "crianca", header: "Criança", render: (r) => r.crianca },
              { key: "telefone", header: "Telefone", render: (r) => r.telefone },
              { key: "status", header: "Status", render: () => <Pill tone="ok">Verificado</Pill> },
              {
                key: "acao",
                header: "",
                render: (r) => (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirWizard(r.id)}>
                    Ver
                  </button>
                ),
              },
            ]}
            footer={<Pagination page={paginaVerificados} pageSize={TAMANHO_PAGINA_GALERIA} total={jaVerificados.length} onPageChange={setPaginaVerificados} />}
          />
        )}
      </Card>

      {perderamVaga.length > 0 && (
        <Card title={`Perderam a vaga (${perderamVaga.length})`} flush>
          <p className="text-sm muted" style={{ padding: "0 16px" }}>
            Mais de 7 dias de atraso na verificação de documento. Fica visível aqui por 7 dias e depois some da lista.
          </p>
          <DataTable
            rows={paginar(perderamVaga, paginaPerdeuVaga, TAMANHO_PAGINA_GALERIA)}
            rowKey={(r) => r.id}
            columns={[
              { key: "nome", header: "Responsável", render: (r) => r.nome },
              { key: "crianca", header: "Criança", render: (r) => r.crianca },
              { key: "telefone", header: "Telefone", render: (r) => r.telefone },
              {
                key: "status",
                header: "Status",
                render: (r) => <Pill tone="danger">Vaga perdida{r.perdeuVagaEm ? ` — ${fmtDateTime(r.perdeuVagaEm)}` : ""}</Pill>,
              },
            ]}
            footer={
              <Pagination page={paginaPerdeuVaga} pageSize={TAMANHO_PAGINA_GALERIA} total={perderamVaga.length} onPageChange={setPaginaPerdeuVaga} />
            }
          />
        </Card>
      )}

      {wizardAberto && (
        <VerificarResponsavelWizard
          responsaveis={responsaveis}
          preselecionadoId={preselecionado}
          onFechar={() => setWizardAberto(false)}
          onVerificado={aoVerificar}
        />
      )}
      <Toast message={message} />
    </Page>
  );
}
