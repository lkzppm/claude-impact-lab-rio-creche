import { ClipboardList, FileCheck2, Users, AlertCircle, Clock, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Page, Card, StackedBar, BarList, Donut, Hero, fmtInt } from "../design-system";
import type { Fatia, Segmento } from "../design-system";
import {
  NOVOS_ALUNOS_EXEMPLO,
  RESPONSAVEIS_EXEMPLO,
  SEGMENTO_LABEL,
  UNIDADE_EXEMPLO,
  VAGAS_POR_SEGMENTO,
  contarPorStatus,
} from "../creche/mock";
import { PRAZO_AVISO_ATRASO_DIAS, PRAZO_PERDA_CRITERIOS_DIAS, PRAZO_PERDA_VAGA_DIAS } from "../creche/fluxoAtrasoDocumento";

const ATALHOS = [
  {
    to: "/creche/vagas",
    Icone: ClipboardList,
    titulo: "Administração de Vagas",
    texto: "Vagas por segmento e prazo de gestão.",
  },
  {
    to: "/creche/novos-alunos",
    Icone: Users,
    titulo: "Novos Alunos",
    texto: "Lista para ligar hoje e galeria de alunos por status.",
  },
  {
    to: "/creche/documentos",
    Icone: FileCheck2,
    titulo: "Verificação de Documentos",
    texto: "Fila de responsáveis e wizard de verificação.",
  },
];

export default function CrecheDashboardPage() {
  const navigate = useNavigate();
  const totalVagas = VAGAS_POR_SEGMENTO.reduce((acc, v) => acc + v.vagas, 0);
  const alunosDaUnidade = NOVOS_ALUNOS_EXEMPLO.filter((a) => a.unidadeCodigo === UNIDADE_EXEMPLO.codigo);
  const convocados = alunosDaUnidade.filter((a) => a.status === "convocado");
  const vagasOcupadas = alunosDaUnidade.filter((a) => a.status === "aprovado").length;
  const { atrasado, estaSemana, verificado } = contarPorStatus(RESPONSAVEIS_EXEMPLO);
  const totalResponsaveis = RESPONSAVEIS_EXEMPLO.length;

  const urgenciaConvocados: Fatia[] = [
    { label: "1 dia até o prazo", value: convocados.filter((a) => a.prazoDiasRestantes <= 1).length, tone: "danger", hint: "risco de perder a vaga", to: "/creche/novos-alunos" },
    { label: "2 dias", value: convocados.filter((a) => a.prazoDiasRestantes === 2).length, tone: "warn", to: "/creche/novos-alunos" },
    { label: "3 dias", value: convocados.filter((a) => a.prazoDiasRestantes >= 3).length, tone: "ok", to: "/creche/novos-alunos" },
  ];

  const vagasPorSegmento: Segmento[] = VAGAS_POR_SEGMENTO.map((v) => ({
    label: SEGMENTO_LABEL[v.segmento],
    value: v.vagas,
    tone: "info",
  }));

  const documentosPorStatus: Segmento[] = [
    { label: "Em atraso", value: atrasado, tone: "danger", hint: "prazo de 1 dia já vencido" },
    { label: "Essa semana", value: estaSemana, tone: "warn", hint: "visita agendada nos próximos 7 dias" },
    { label: "Verificados", value: verificado, tone: "ok" },
  ];

  return (
    <Page
      title={`Painel — ${UNIDADE_EXEMPLO.nome}`}
      subtitle="Vagas por segmento, convocados aguardando comparecimento e a fila de verificação de documentos."
    >
      <Card title="Para hoje">
        <div className="para-hoje">
          <Donut
            fatias={urgenciaConvocados}
            centro={fmtInt(convocados.length)}
            centroLabel="convocados"
            ariaLabel="Convocados por urgência de comparecimento"
            onFatia={(f) => f.to && navigate(f.to)}
          />
          <div className="para-hoje-lado">
            <p className="text-sm muted">
              Cada fatia é uma parte dos convocados aguardando comparecimento. Clique para abrir a lista, da mais urgente para a menos.
            </p>
            <Hero value={`${vagasOcupadas}/${totalVagas}`} label="Vagas já ocupadas" hint="alunos aprovados sobre o total de vagas da unidade" />
            <p className="text-sm">
              <strong>{fmtInt(atrasado)}</strong> responsável(is) com verificação de documento em atraso ·{" "}
              <Link to="/creche/documentos">ver lista →</Link>
            </p>
          </div>
        </div>
      </Card>

      <Card title="Cronograma de escalação — Atraso na verificação de documento">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", paddingBottom: 12, borderBottom: "1px solid var(--mr-grey-200)" }}>
            <AlertCircle size={20} style={{ color: "var(--warn)" }} aria-hidden="true" />
            <div>
              <strong>Dia {PRAZO_AVISO_ATRASO_DIAS}</strong>
              <p className="text-sm muted">Aviso enviado ao responsável; começa contagem regressiva</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", paddingBottom: 12, borderBottom: "1px solid var(--mr-grey-200)" }}>
            <Clock size={20} style={{ color: "var(--danger)" }} aria-hidden="true" />
            <div>
              <strong>Dia {PRAZO_PERDA_CRITERIOS_DIAS}</strong>
              <p className="text-sm muted">Critérios "irmão na rede" e "Pequenos Cariocas" deixam de contar na pontuação</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Trash2 size={20} style={{ color: "var(--danger)" }} aria-hidden="true" />
            <div>
              <strong>Dia {PRAZO_PERDA_VAGA_DIAS}</strong>
              <p className="text-sm muted">Criança perde a vaga; visível na galeria "Perdeu a vaga" por {PRAZO_PERDA_VAGA_DIAS} dias</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Vagas por segmento">
          <BarList itens={vagasPorSegmento.map((s) => ({ label: s.label, value: s.value }))} tone="info" />
          <p className="text-sm muted" style={{ marginTop: 8 }}>
            {fmtInt(totalVagas)} vagas no total nesta unidade.
          </p>
        </Card>

        <Card title="Verificação de documentos">
          <StackedBar segmentos={documentosPorStatus} ariaLabel="Responsáveis por status de verificação" />
          <p className="text-sm muted" style={{ marginTop: 8 }}>
            {fmtInt(totalResponsaveis)} responsável(is) no total.
          </p>
        </Card>
      </div>

      <div className="grid-tiles">
        {ATALHOS.map(({ to, Icone, titulo, texto }) => (
          <Link to={to} key={to} className="atalho-card">
            <Icone size={28} strokeWidth={1.75} aria-hidden="true" />
            <span className="atalho-titulo">{titulo}</span>
            <span className="atalho-texto">{texto}</span>
            <span className="stat-cta">Abrir →</span>
          </Link>
        ))}
      </div>
    </Page>
  );
}

