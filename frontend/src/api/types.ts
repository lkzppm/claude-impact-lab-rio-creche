/* Tipos espelhando spec/11-baseline-tecnico.md (API /api/v1) */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface Health {
  status: string;
  db: string;
  versao: string;
}

export interface Processo {
  ano: number;
  prm_id: number;
  descricao?: string | null;
  n_perguntas?: number;
  pontuacao_maxima?: number;
}

export interface Pergunta {
  ano: number;
  ich_perg_id: number;
  perg_id?: number | null;
  texto: string;
  pontuacao: number;
  criterio_desempate: boolean;
  ordem?: number | null;
}

export interface Unidade {
  codigo: string;
  nome: string;
  tipo?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cep?: string | null;
  cre?: string | null;
  microarea?: string | null;
  polo?: string | null;
  lat?: number | null;
  lon?: number | null;
}

export interface Capacidade {
  ano: number;
  unidade_codigo: string;
  grupamento: string;
  horario: string;
  vagas: number;
  fonte: "estimada_confirmados" | "informada" | string;
}

export interface UnidadeDetalhe extends Unidade {
  capacidade: Capacidade[];
}

export interface Opcao {
  id: number;
  inscricao_id: number;
  ordem: number;
  unidade_codigo: string;
  unidade_nome?: string | null;
  grupamento: string;
  horario: string;
  situacao_origem?: string | null;
}

export interface Resposta {
  ich_perg_id: number;
  texto?: string | null;
  pontuacao?: number | null;
  resposta: boolean;
  confirmado: boolean;
}

export interface Inscricao {
  id: number;
  ano: number;
  prm_id: number;
  plm_id: number;
  ipl_id: number;
  aluno_anon: string;
  responsavel_anon?: string | null;
  nascimento_anomes?: string | null;
  sexo?: string | null;
  cep?: string | null;
  bairro?: string | null;
  data_criacao?: string | null;
  pontuacao: number;
}

export interface InscricaoDetalhe extends Inscricao {
  opcoes: Opcao[];
  respostas: Resposta[];
}

export interface RodadaResumo {
  n_inscricoes: number;
  n_alocadas: number;
  n_lista_espera: number;
  n_sem_opcao: number;
  por_ordem_da_opcao: Record<string, number>;
  n_criancas_com_alguma_presa?: number;
  media_presas_por_crianca?: number;
  n_unidades?: number;
  duracao_ms?: number;
}

export interface Rodada {
  id: number;
  ano: number;
  tipo: "inicial" | "rematch" | string;
  criada_em: string;
  parametros: {
    grupamento?: string | null;
    horario?: string | null;
    vagas_presas?: number;
    alternativas?: number;
    [k: string]: unknown;
  };
  hash_entrada?: string | null;
  resumo: RodadaResumo | null;
}

export interface NovaRodada {
  ano: number;
  grupamento?: string | null;
  horario?: string | null;
  tipo: "inicial" | "rematch";
  /** vagas reservadas por criança (padrão 3) */
  vagas_presas?: number;
  /** posições só na fila, sem vaga (padrão 2) */
  alternativas?: number;
}

export type AlocacaoTipo = "presa" | "selecionavel";

export interface Proposta {
  unidade: string;
  unidade_nome?: string | null;
  ordem: number;
  resultado: "aceita" | "rejeitada" | "retida" | string;
  corte?: number | null;
  vagas?: number | null;
  /** presa = vaga reservada; selecionavel = só posição na fila */
  tipo?: AlocacaoTipo | null;
  posicao?: number | null;
}

export interface Motivo {
  propostas: Proposta[];
  final?: { unidade: string; unidade_nome?: string | null; ordem: number; posicao: number } | null;
}

export interface Alocacao {
  id: number;
  rodada_id: number;
  inscricao_id: number;
  opcao_id?: number | null;
  unidade_codigo?: string | null;
  unidade_nome?: string | null;
  grupamento: string;
  horario: string;
  status: "alocada" | "lista_espera" | "sem_opcao_viavel" | string;
  tipo?: AlocacaoTipo | null;
  posicao_fila?: number | null;
  pontuacao: number;
  motivo: Motivo;
  aluno_anon?: string | null;
}

export interface Explicacao {
  inscricao_id: number;
  rodada_id: number;
  texto: string;
  motivo: Motivo;
  status: string;
  pontuacao: number;
}

export interface Evento {
  id: number;
  ocorrido_em: string;
  tipo: string;
  convocacao_id?: number | null;
  inscricao_id?: number | null;
  unidade_codigo?: string | null;
  ator?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface Convocacao {
  id: number;
  alocacao_id: number;
  inscricao_id: number;
  aluno_anon?: string | null;
  unidade_codigo: string;
  unidade_nome?: string | null;
  cre?: string | null;
  grupamento: string;
  horario: string;
  status: string;
  prazo_fim?: string | null;
  criada_em: string;
  atualizada_em: string;
  horas_no_status: number;
  n_tentativas?: number;
}

export interface ConvocacaoIrma {
  id: number;
  unidade_nome?: string | null;
  unidade_codigo?: string | null;
  status: string;
}

export interface ConvocacaoDetalhe extends Convocacao {
  eventos: Evento[];
  /** outras convocações da mesma criança (mesma inscricao_id); pode não vir */
  irmas?: ConvocacaoIrma[] | null;
}

export type EventoTipo =
  | "tentativa_contato"
  | "contato_confirmado"
  | "matricula_confirmada"
  | "recusa"
  | "expiracao";

export interface NovoEvento {
  tipo: EventoTipo | string;
  payload?: Record<string, unknown>;
}

export interface PainelResumo {
  selecionadas_aguardando: {
    total: number;
    faixa_0_24h: number;
    faixa_24_48h: number;
    faixa_48_72h: number;
    faixa_mais_72h: number;
  };
  vagas_em_risco: number;
  sem_contato: number;
  inconsistencias: number;
  confirmadas?: number;
  vagas_presas_por_crianca?: number | null;
  vagas_liberadas_hoje?: number | null;
  atualizado_em?: string;
}

export interface PainelUnidade {
  unidade_codigo: string;
  unidade_nome: string;
  cre?: string | null;
  vagas: number;
  alocadas: number;
  convocadas: number;
  confirmadas: number;
  em_atraso: number;
  aguardando?: number;
}

export interface GerarConvocacoesResposta {
  rodada_id: number;
  n_convocacoes: number;
}

/* ---------- comprovações via bases oficiais ---------- */
export type ComprovacaoResultado = "confirmado" | "nao_encontrado" | "erro" | "pendente";

export interface Comprovacao {
  criterio: string;
  fonte: string;
  resultado: ComprovacaoResultado | string;
  protocolo?: string | null;
  consultado_em?: string | null;
}

/* ---------- visão da família ---------- */
export type FamiliaSituacao =
  | "reservas_abertas"
  | "matricula_confirmada"
  | "lista_espera"
  | "sem_opcao_viavel"
  | "aguardando_classificacao";

export interface FamiliaCriterio {
  ich_perg_id: number;
  texto: string;
  pontos: number;
  declarado: boolean;
  comprovado: ComprovacaoResultado | null;
}

export interface FamiliaOpcao {
  ordem: number;
  unidade_codigo: string;
  unidade_nome?: string | null;
  bairro?: string | null;
  situacao_origem?: string | null;
  resultado: "reservada" | "fila" | "sem_vaga" | null;
  posicao?: number | null;
}

export interface FamiliaConvocacao {
  id: number;
  unidade_codigo: string;
  unidade_nome?: string | null;
  status: string;
  prazo_fim?: string | null;
  horas_restantes?: number | null;
  pode_responder: boolean;
}

export interface FamiliaInscricao {
  inscricao: {
    id: number;
    ano: number;
    aluno_anon?: string | null;
    nascimento_anomes?: string | null;
    grupamento?: string | null;
    horario?: string | null;
    bairro?: string | null;
    pontuacao: number;
    data_criacao?: string | null;
  };
  pontuacao: { total: number; maxima: number; criterios: FamiliaCriterio[] };
  opcoes: FamiliaOpcao[];
  rodada: { id: number; criada_em: string; tipo: string } | null;
  explicacao: string | null;
  convocacoes: FamiliaConvocacao[];
  comprovacoes: Comprovacao[];
  situacao_resumo: FamiliaSituacao;
}

export type FamiliaResposta = "confirmar" | "recusar";

/* ---------- visão da rede (Nível Central) ---------- */
export interface PainelCre {
  cre: string;
  unidades: number;
  vagas: number;
  inscricoes: number;
  alocadas: number;
  convocadas: number;
  abertas: number;
  confirmadas: number;
  em_atraso: number;
  lista_espera: number;
}
