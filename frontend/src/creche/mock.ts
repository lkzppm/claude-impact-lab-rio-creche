/**
 * Dados de exemplo do painel da creche/EDI.
 *
 * Esta área ainda não tem endpoint próprio no backend (spec/11-baseline-tecnico.md lista só os
 * painéis Família, CRE e SME). Os dados abaixo são mocks para validar a tela; os pontos que vão
 * virar chamada de API ou escrita no banco estão marcados com TODO.
 *
 * Ordem do funil (define os status usados nas telas):
 *   1. Família faz a inscrição da criança.
 *   2. Verificação de documento — opcional, pode ser pulada (tela "Verificação de Documentos").
 *      Prazo de 1 dia; quem tem visita agendada essa semana aparece primeiro.
 *   3. Criança é aprovada para a rede e, se a família confirma que vai, é convocada — aí aparece
 *      em "Novos Alunos" com até 3 dias para a família comparecer na unidade.
 *   4. A creche confirma o comparecimento (com o nome de quem autorizou) e a criança passa para
 *      "Alunos aprovados".
 */

export type Segmento = "bercario" | "maternal_1" | "maternal_2";

export const SEGMENTO_LABEL: Record<Segmento, string> = {
  bercario: "Berçário",
  maternal_1: "Maternal I",
  maternal_2: "Maternal II",
};

export interface VagasSegmento {
  segmento: Segmento;
  vagas: number;
}

/** Unidade logada nesta sessão (viria da autenticação — fora de escopo aqui). */
/** Unidade real da base (4ª CRE, Ramos) — os números abaixo continuam sendo de demonstração. */
export const UNIDADE_EXEMPLO = { codigo: "0430813", nome: "EDI Armando de Salles Oliveira" };

export const VAGAS_POR_SEGMENTO: VagasSegmento[] = [
  { segmento: "bercario", vagas: 12 },
  { segmento: "maternal_1", vagas: 18 },
  { segmento: "maternal_2", vagas: 15 },
];

/**
 * Liga/desliga a edição da Administração de Vagas. Em produção isso vem da configuração do
 * processo no banco (ex.: `processo.periodo_gestao_vaga_aberto` ou uma janela de datas em
 * `processo`), não de uma flag de frontend.
 */
export const PERIODO_GESTAO_VAGA_ABERTO = true;

/** TODO: vem de `processo` no banco (ex.: `processo.prazo_gestao_vagas`). Mock por enquanto. */
export const PRAZO_GESTAO_VAGAS = "2026-09-15T23:59:00-03:00";

/**
 * Cronograma oficial do processo, definido pelo Nível Central (não pela unidade). Em produção
 * vem da tabela `processo` (datas por `ano` + `ich_perg_id`/etapa — spec/01-contexto-e-legislacao.md);
 * aqui é mock só para a unidade acompanhar os prazos que não controla.
 */
export interface EtapaCronogramaCentral {
  chave: string;
  label: string;
  data: string;
}

export const CRONOGRAMA_CENTRAL_EXEMPLO: EtapaCronogramaCentral[] = [
  { chave: "mudanca_vagas_esperadas", label: "Mudança no número de vagas esperadas por segmento", data: "2026-09-01T00:00:00-03:00" },
  { chave: "inicio_pre_inscricao", label: "Início da pré-inscrição", data: "2026-09-10T00:00:00-03:00" },
  { chave: "fim_pre_inscricao", label: "Fim da pré-inscrição", data: "2026-09-25T23:59:00-03:00" },
  { chave: "vagas_oficiais_ano", label: "Divulgação das vagas oficiais do ano", data: "2026-10-01T00:00:00-03:00" },
  { chave: "inicio_inscricao", label: "Início da inscrição", data: "2026-10-05T00:00:00-03:00" },
  { chave: "fim_inscricao", label: "Fim da inscrição", data: "2026-10-20T23:59:00-03:00" },
];

/* ---------------------------- Verificação de documentos ---------------------------- */

export type StatusVerificacao = "pendente" | "atrasado" | "verificado";

/** Prazo para a verificação de documento, em dias, a partir da convocação para a visita. */
export const PRAZO_VERIFICACAO_DOCUMENTO_DIAS = 1;

export interface Responsavel {
  id: string;
  nome: string;
  crianca: string;
  segmento: Segmento;
  telefone: string;
  statusVerificacao: StatusVerificacao;
  /** ISO date da visita agendada à unidade; null quando não há agendamento (ex.: já em atraso). */
  dataAgendada: string | null;
  irmaoNaRede: boolean | null;
  pequenosCariocas: boolean | null;
  /** dias desde o vencimento do prazo de verificação (1 dia = 1 dia útil após o prazo). */
  diasAtraso?: number;
}

const hojeMaisDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString();
};

export const RESPONSAVEIS_EXEMPLO: Responsavel[] = [
  { id: "r1", nome: "Ana Paula Souza", crianca: "Miguel Souza", segmento: "bercario", telefone: "(21) 99123-4501", statusVerificacao: "atrasado", dataAgendada: null, irmaoNaRede: null, pequenosCariocas: null, diasAtraso: 1 },
  { id: "r2", nome: "Carlos Eduardo Lima", crianca: "Sofia Lima", segmento: "maternal_1", telefone: "(21) 99123-4502", statusVerificacao: "atrasado", dataAgendada: null, irmaoNaRede: null, pequenosCariocas: null, diasAtraso: 5 },
  { id: "r3", nome: "Beatriz Nunes", crianca: "Davi Nunes", segmento: "maternal_2", telefone: "(21) 99123-4503", statusVerificacao: "pendente", dataAgendada: hojeMaisDias(1), irmaoNaRede: null, pequenosCariocas: null },
  { id: "r4", nome: "Felipe Andrade", crianca: "Helena Andrade", segmento: "bercario", telefone: "(21) 99123-4504", statusVerificacao: "pendente", dataAgendada: hojeMaisDias(3), irmaoNaRede: null, pequenosCariocas: null },
  { id: "r7", nome: "Marcela Vieira", crianca: "Pedro Vieira", segmento: "maternal_1", telefone: "(21) 99123-4507", statusVerificacao: "pendente", dataAgendada: hojeMaisDias(5), irmaoNaRede: null, pequenosCariocas: null },
  { id: "r5", nome: "Juliana Ramos", crianca: "Théo Ramos", segmento: "maternal_1", telefone: "(21) 99123-4505", statusVerificacao: "verificado", dataAgendada: null, irmaoNaRede: true, pequenosCariocas: false },
  { id: "r6", nome: "Rodrigo Farias", crianca: "Laura Farias", segmento: "maternal_2", telefone: "(21) 99123-4506", statusVerificacao: "verificado", dataAgendada: null, irmaoNaRede: false, pequenosCariocas: true },
  // registros extras só para demonstrar a paginação (10 por página) nas três galerias
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `r-atraso-extra-${i}`,
    nome: `Responsável em Atraso ${i + 1}`,
    crianca: `Criança em Atraso ${i + 1}`,
    segmento: (["bercario", "maternal_1", "maternal_2"] as const)[i % 3],
    telefone: `(21) 9${8000 + i}-0000`,
    statusVerificacao: "atrasado" as StatusVerificacao,
    dataAgendada: null,
    irmaoNaRede: null,
    pequenosCariocas: null,
    diasAtraso: i % 5 === 0 ? 8 : 2 + i,
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `r-verificado-extra-${i}`,
    nome: `Responsável Verificado ${i + 1}`,
    crianca: `Criança Verificada ${i + 1}`,
    segmento: (["bercario", "maternal_1", "maternal_2"] as const)[i % 3],
    telefone: `(21) 9${9000 + i}-0000`,
    statusVerificacao: "verificado" as StatusVerificacao,
    dataAgendada: null,
    irmaoNaRede: i % 2 === 0,
    pequenosCariocas: i % 2 !== 0,
  })),
];

export function contarPorStatus(lista: Responsavel[]) {
  return {
    atrasado: lista.filter((r) => r.statusVerificacao === "atrasado").length,
    estaSemana: lista.filter((r) => r.statusVerificacao === "pendente").length,
    verificado: lista.filter((r) => r.statusVerificacao === "verificado").length,
  };
}

/** Agendados essa semana (próximos 7 dias), do mais próximo para o mais distante. */
export function agendadosEstaSemana(lista: Responsavel[]): Responsavel[] {
  const limite = hojeMaisDias(7);
  return lista
    .filter((r) => r.statusVerificacao === "pendente" && r.dataAgendada && r.dataAgendada <= limite)
    .sort((a, b) => (a.dataAgendada ?? "").localeCompare(b.dataAgendada ?? ""));
}

export function emAtraso(lista: Responsavel[]): Responsavel[] {
  return lista.filter((r) => r.statusVerificacao === "atrasado");
}

export function verificados(lista: Responsavel[]): Responsavel[] {
  return lista.filter((r) => r.statusVerificacao === "verificado").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Tamanho de página padrão das galerias (responsáveis e alunos). */
export const TAMANHO_PAGINA_GALERIA = 10;

/* ---------------------------------- Novos alunos ---------------------------------- */

/**
 * "recusado" tira a criança da lista de convocados desta unidade (fluxo de recusa, resposta manual).
 * "perdeu_vaga" é o fim do cronograma de comparecimento (`fluxoConvocacao.ts`) — não confirmou
 * presença em 3 dias úteis. Dispara o reparelhamento com outra escola.
 */
export type StatusNovoAluno = "convocado" | "aprovado" | "recusado" | "perdeu_vaga";

export const STATUS_NOVO_ALUNO_LABEL: Record<StatusNovoAluno, string> = {
  convocado: "Selecionada",
  aprovado: "Matrícula confirmada",
  recusado: "Recusada",
  perdeu_vaga: "Prazo vencido",
};

/** Prazo total, em dias, que a família tem para comparecer após a convocação. */
export const PRAZO_COMPARECIMENTO_DIAS = 3;

export interface Contato {
  nome: string;
  telefone: string;
}

export interface NovoAluno {
  id: string;
  nome: string;
  segmento: Segmento;
  /** unidade para a qual a criança foi convocada — a galeria só mostra a unidade logada */
  unidadeCodigo: string;
  /** contato escolhido pela pipeline como quem respondeu mais rápido */
  contatoPrincipal: Contato;
  /** demais contatos possíveis da família, em ordem de tentativa */
  outrosContatos: Contato[];
  status: StatusNovoAluno;
  /** dias restantes para comparecer; só é relevante enquanto status === "convocado" */
  prazoDiasRestantes: number;
  /** resultado da última ligação registrada (não atendeu / aceitou visita / recusou) */
  ultimoContato?: "nao_atendeu" | "aceitou_visita" | "recusou" | null;
  /** resposta da pergunta "vai à visita?" feita nos dias 1 e 2 do cronograma de comparecimento */
  confirmacaoVisita?: "sim" | "nao" | null;
  /** true quando a escola já tentou ligar para o contato principal (dia 2, sem resposta) */
  ligacaoTentada?: boolean;
  aprovadoPor?: string | null;
  aprovadoEm?: string | null;
  /** ISO date de quando a vaga foi perdida por não comparecimento; só relevante em "perdeu_vaga" */
  perdeuVagaEm?: string | null;
}

export const NOVOS_ALUNOS_EXEMPLO: NovoAluno[] = [
  {
    id: "a1",
    nome: "Miguel Souza",
    segmento: "bercario",
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: "Ana Paula Souza (mãe)", telefone: "(21) 99123-4501" },
    outrosContatos: [
      { nome: "José Souza (pai)", telefone: "(21) 99123-4511" },
      { nome: "Marta Souza (avó)", telefone: "(21) 99123-4521" },
    ],
    status: "convocado",
    prazoDiasRestantes: 1,
  },
  {
    id: "a2",
    nome: "Sofia Lima",
    segmento: "maternal_1",
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: "Carlos Eduardo Lima (pai)", telefone: "(21) 99123-4502" },
    outrosContatos: [{ nome: "Renata Lima (mãe)", telefone: "(21) 99123-4512" }],
    status: "convocado",
    prazoDiasRestantes: 3,
  },
  {
    id: "a4",
    nome: "Helena Andrade",
    segmento: "bercario",
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: "Felipe Andrade (pai)", telefone: "(21) 99123-4504" },
    outrosContatos: [
      { nome: "Camila Andrade (mãe)", telefone: "(21) 99123-4514" },
      { nome: "Sérgio Andrade (avô)", telefone: "(21) 99123-4524" },
      { nome: "Vovó Andrade", telefone: "(21) 99123-4534" },
    ],
    status: "convocado",
    prazoDiasRestantes: 2,
  },
  {
    id: "a3",
    nome: "Davi Nunes",
    segmento: "maternal_2",
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: "Beatriz Nunes (mãe)", telefone: "(21) 99123-4503" },
    outrosContatos: [],
    status: "aprovado",
    prazoDiasRestantes: 0,
    aprovadoPor: "Marcos Vieira (diretor adjunto)",
    aprovadoEm: "2026-08-24T09:10:00-03:00",
  },
  {
    id: "a5",
    nome: "Isadora Melo",
    segmento: "maternal_1",
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: "Patrícia Melo (mãe)", telefone: "(21) 99123-4508" },
    outrosContatos: [],
    status: "aprovado",
    prazoDiasRestantes: 0,
    aprovadoPor: "Marcos Vieira (diretor adjunto)",
    aprovadoEm: "2026-08-20T14:00:00-03:00",
  },
  {
    id: "a6",
    nome: "Aluno de outra unidade",
    segmento: "maternal_2",
    unidadeCodigo: "EDI-OUTRA-UNIDADE",
    contatoPrincipal: { nome: "Responsável de outra unidade", telefone: "(21) 90000-0000" },
    outrosContatos: [],
    status: "convocado",
    prazoDiasRestantes: 2,
  },
  {
    id: "a7",
    nome: "Bernardo Castro",
    segmento: "bercario",
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: "Vanessa Castro (mãe)", telefone: "(21) 99123-4509" },
    outrosContatos: [],
    status: "perdeu_vaga",
    prazoDiasRestantes: 0,
    confirmacaoVisita: null,
    ligacaoTentada: true,
    perdeuVagaEm: hojeMaisDias(-1),
  },
  {
    id: "a8",
    nome: "Clara Menezes",
    segmento: "maternal_2",
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: "Diego Menezes (pai)", telefone: "(21) 99123-4510" },
    outrosContatos: [],
    status: "perdeu_vaga",
    prazoDiasRestantes: 0,
    confirmacaoVisita: "nao",
    ligacaoTentada: true,
    perdeuVagaEm: hojeMaisDias(-2),
  },
  // registros extras só para demonstrar a paginação (10 por página) nas galerias de convocados e aprovados
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `a-convocado-extra-${i}`,
    nome: `Criança Convocada ${i + 1}`,
    segmento: (["bercario", "maternal_1", "maternal_2"] as const)[i % 3],
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: `Responsável Convocado ${i + 1}`, telefone: `(21) 9${7000 + i}-0000` },
    outrosContatos: [],
    status: "convocado" as StatusNovoAluno,
    prazoDiasRestantes: (i % 3) + 1,
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `a-aprovado-extra-${i}`,
    nome: `Criança Aprovada ${i + 1}`,
    segmento: (["bercario", "maternal_1", "maternal_2"] as const)[i % 3],
    unidadeCodigo: UNIDADE_EXEMPLO.codigo,
    contatoPrincipal: { nome: `Responsável Aprovado ${i + 1}`, telefone: `(21) 9${6000 + i}-0000` },
    outrosContatos: [],
    status: "aprovado" as StatusNovoAluno,
    prazoDiasRestantes: 0,
    aprovadoPor: "Marcos Vieira (diretor adjunto)",
    aprovadoEm: "2026-08-15T10:00:00-03:00",
  })),
];

/** Convocados com 1 dia restante primeiro (mais urgente no topo). */
export function ordenarConvocados(lista: NovoAluno[]): NovoAluno[] {
  return [...lista].sort((a, b) => a.prazoDiasRestantes - b.prazoDiasRestantes);
}

export function ordenarAprovadosAlfabetico(lista: NovoAluno[]): NovoAluno[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Quem perdeu a vaga por não comparecimento, mais recente primeiro. */
export function ordenarPerderamVaga(lista: NovoAluno[]): NovoAluno[] {
  return lista
    .filter((a) => a.status === "perdeu_vaga")
    .sort((a, b) => (b.perdeuVagaEm ?? "").localeCompare(a.perdeuVagaEm ?? ""));
}

/**
 * Lista de responsáveis para ligar hoje.
 *
 * TODO: pipeline interna — em produção, um job de backend seleciona esta lista por prazo de
 * comparecimento, tentativas de contato já feitas e prioridade da criança. `contatoPrincipal` é
 * quem a pipeline identificou como o contato que respondeu mais rápido nas tentativas anteriores;
 * `outrosContatos` é a lista de fallback, também decidida pela pipeline.
 */
export function ligarHoje(alunos: NovoAluno[]) {
  return alunos
    .filter((a) => a.status === "convocado")
    .map((a) => ({
      alunoId: a.id,
      nome: a.nome,
      contatoPrincipal: a.contatoPrincipal,
      outrosContatos: a.outrosContatos,
      ultimoContato: a.ultimoContato ?? null,
    }));
}
