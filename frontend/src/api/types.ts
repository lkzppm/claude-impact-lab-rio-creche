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
  unidade_codigo?: string;
  grupamento: string;
  horario: string;
  vagas: number;
  fonte: "estimada_confirmados" | "informada" | string;
}

export interface UnidadeDetalhe extends Unidade {
  capacidade: Capacidade[];
}

export interface NovaCapacidade {
  ano: number;
  grupamento: string;
  horario: string;
  vagas: number;
  ator?: string | null;
}

export type FilaSituacao = "aguardando" | "convocada_aqui" | "confirmada_em_outra" | "reservas_cheias";

export interface FilaUnidadeItem {
  alocacao_id: number;
  inscricao_id: number;
  aluno_anon?: string | null;
  pontuacao: number;
  posicao_fila?: number | null;
  ordem?: number | null;
  situacao: FilaSituacao | string;
  reservas_abertas: number;
}

export interface FilaUnidade {
  unidade_codigo: string;
  rodada_id?: number | null;
  grupamento?: string | null;
  horario?: string | null;
  grupos: { grupamento: string; horario: string; n_fila: number; n_reservadas: number }[];
  n_fila: number;
  n_reservadas: number;
  n_convocadas_abertas: number;
  itens: FilaUnidadeItem[];
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
  resultado: "retida_provisoriamente" | "rejeitada" | "desbancada" | string;
  corte?: number | null;
  vagas?: number | null;
  /** presa = vaga reservada; selecionavel = só posição na fila */
  tipo?: AlocacaoTipo | null;
  posicao?: number | null;
}

export interface VagaMotivo {
  unidade: string;
  unidade_nome?: string | null;
  ordem: number;
  posicao: number;
  tipo: AlocacaoTipo | string;
}

export interface Motivo {
  propostas: Proposta[];
  presas?: VagaMotivo[];
  selecionaveis?: VagaMotivo[];
  final?: { unidade: string; unidade_nome?: string | null; ordem: number; posicao: number; tipo?: string } | null;
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
  pontuacao?: number | null;
  atrasada?: boolean;
  /** frase curta para o polo: o que fazer agora */
  proxima_acao?: string | null;
}

export interface ConvocacaoIrma {
  id: number;
  unidade_nome?: string | null;
  unidade_codigo?: string | null;
  status: string;
}

export interface ProximoDaFila {
  alocacao_id: number;
  inscricao_id: number;
  aluno_anon?: string | null;
  pontuacao: number;
  posicao_fila?: number | null;
  ordem?: number | null;
  reservas_abertas: number;
}

export interface ConvocacaoDetalhe extends Convocacao {
  eventos: Evento[];
  /** outras convocações da mesma criança (mesma inscricao_id); pode não vir */
  irmas?: ConvocacaoIrma[] | null;
  /** só quando a vaga desta convocação foi liberada e ainda não foi repassada */
  proximo_da_fila?: ProximoDaFila | null;
  /** id da convocação criada a partir desta vaga liberada */
  repassada_para?: number | null;
}

/** recortes de trabalho do polo (GET /convocacoes?fila=) */
export type FilaConvocacao = "vencidas" | "vencem_24h" | "sem_aviso" | "aguardando" | "abertas" | "trabalho" | "encerradas";

export type CanalContato = "whatsapp" | "ligacao" | "sms" | "email" | "visita";

export type EventoTipo =
  | "tentativa_contato"
  | "contato_confirmado"
  | "matricula_confirmada"
  | "recusa"
  | "expiracao";

export interface NovoEvento {
  tipo: EventoTipo | string;
  payload?: Record<string, unknown>;
  /** quem registra (nome/matrícula do servidor); vai para o log de eventos */
  ator?: string | null;
}

export interface ExpirarVencidasResposta {
  expiradas: number;
  ids: number[];
}

export interface MultiReservaItem {
  inscricao_id: number;
  aluno_anon?: string | null;
  pontuacao: number;
  n_abertas: number;
  unidades: string[];
  mais_antiga_em: string;
  horas_mais_antiga: number;
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
  recusadas?: number;
  expiradas?: number;
  vagas_presas_por_crianca?: number | null;
  vagas_liberadas_hoje?: number | null;
  atualizado_em?: string;
  /* filas de trabalho do polo */
  vencidas?: number;
  vencem_24h?: number;
  sem_aviso?: number;
  aguardando_familia?: number;
  criancas_multireserva?: number;
  tempo_medio_ate_desfecho_h?: number | null;
  n_desfechos?: number;
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
  liberadas?: number;
  aguardando?: number;
}

/** Os números de um território (CRE ou rede). Ver `PainelNumeros` em backend/app/schemas.py: cada campo
 *  vem de uma população diferente — pré-cadastro e inscrição NÃO se somam (não há chave em comum). */
export interface PainelNumeros {
  cre?: string | null;
  ano?: number | null;
  unidades: number;
  criancas_cadastradas: number;
  inscritas: number;
  pre_cadastros: number;
  vagas_informadas: number;
  vagas_estimadas: number;
  expectativa_vagas: number;
  reservadas: number;
  vagas_livres: number;
  lista_espera: number;
}

export interface GerarConvocacoesResposta {
  rodada_id: number;
  convocacoes_criadas: number;
  ja_existentes: number;
  puladas?: number;
  prazo_fim?: string | null;
}

/* ---------- motor contínuo (roda sozinho, 24/7) ---------- */
export interface MotorCiclo {
  em: string;
  duracao_ms: number;
  ano?: number | null;
  rodada_id?: number | null;
  rodada_criada: boolean;
  motivo_rodada?: "bootstrap" | "entrada_mudou" | null;
  convocacoes_criadas: number;
  expiradas: number;
  repassadas: number;
  vagas_sem_fila: number;
  erro?: string | null;
}

export interface MotorEstado {
  ligado: boolean;
  intervalo_s: number;
  expira_vencidas: boolean;
  executando: boolean;
  iniciado_em?: string | null;
  ultima_execucao?: string | null;
  proxima_execucao?: string | null;
  ciclos: number;
  total_rodadas: number;
  total_convocacoes: number;
  total_expiradas: number;
  total_repassadas: number;
  ultimo_ciclo?: MotorCiclo | null;
  ultimo_erro?: string | null;
  rodada_vigente?: Rodada | null;
  vagas_liberadas_pendentes: number;
}

/* ---------- mapa com drill-down (rede → CRE → creche) ---------- */
export interface MapaCre {
  cre: string;
  lat?: number | null;
  lon?: number | null;
  unidades: number;
  unidades_no_mapa: number;
  vagas: number;
  inscricoes: number;
  alocadas: number;
  lista_espera: number;
  convocadas: number;
  abertas: number;
  confirmadas: number;
  em_atraso: number;
}

export interface MapaUnidade {
  codigo: string;
  nome?: string | null;
  cre?: string | null;
  tipo?: string | null;
  bairro?: string | null;
  lat?: number | null;
  lon?: number | null;
  vagas: number;
  inscricoes: number;
  alocadas: number;
  lista_espera: number;
  convocadas: number;
  abertas: number;
  confirmadas: number;
  em_atraso: number;
}

export interface Mapa {
  ano?: number | null;
  nivel: "rede" | "cre";
  cre?: string | null;
  atualizado_em: string;
  cres: MapaCre[];
  unidades: MapaUnidade[];
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

/* ---------- mensageria (WhatsApp / e-mail / SMS) ---------- */
export interface MensagemIn {
  canal: "whatsapp" | "email" | "sms";
  destino: string;
  template: string;
  dados?: Record<string, unknown>;
  referencia?: string | null;
  chave_idem?: string | null;
  ator?: string;
}

export type ResultadoEnvio = "enviado" | "simulado" | "pendente" | "falha";

export interface MensagemResultado {
  resultado: ResultadoEnvio | string;
  detalhe?: string | null;
  protocolo?: string | null;
  id?: string | number | null;
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

/* ---------- pré-cadastro (família) ---------- */
export interface ReguaFamilia {
  ano: number;
  maxima: number;
  perguntas: { ich_perg_id: number; texto: string; pontos: number; desempate: boolean; automatico: boolean; fonte_automatica: string | null }[];
}

export interface Verificado {
  criterio: string;
  fonte: string;
  resultado: "confirmado" | "nao_encontrado" | "erro" | "pendente";
  protocolo: string | null;
  ich_perg_id: number;
  texto: string;
  pontos: number;
  bloqueia_manual: boolean;
}

export interface Verificacao {
  verificados: Verificado[];
  respostas_automaticas: Record<string, boolean>;
}

export interface GeoCep {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  lat: number | null;
  lon: number | null;
  fonte: string;
}

export type Chance = "alta" | "media" | "baixa" | "sem_vaga";

export interface UnidadeSugerida {
  codigo: string;
  nome: string;
  bairro: string | null;
  lat: number | null;
  lon: number | null;
  distancia_km: number | null;
  vagas: number;
  corte: number | null;
  taxa_pct: number | null;
  n_base: number;
  chance: Chance;
  ordem_sugerida: number;
}

export interface SugestoesIn {
  cep: string;
  lat?: number | null;
  lon?: number | null;
  grupamento: string;
  horario: string;
  respostas: Record<string, boolean>;
}

export interface Sugestoes {
  pontuacao: { total: number; maxima: number; itens: { ich_perg_id: number; texto: string; pontos: number }[] };
  regua_ano: number;
  casa: { lat: number | null; lon: number | null; bairro: string | null; fonte: string } | null;
  unidades: UnidadeSugerida[];
}

export type Canal = "celular" | "whatsapp" | "email";

export interface Contato {
  nome: string;
  parentesco: string;
  canal: Canal;
  valor: string;
  principal: boolean;
}

export interface PreCadastroIn {
  cpf: string;
  nome_responsavel: string;
  nome_crianca?: string;
  nascimento_anomes: string;
  grupamento: string;
  horario: string;
  cep: string;
  cep_alternativo?: string;
  lat?: number | null;
  lon?: number | null;
  respostas: Record<string, boolean>;
  contatos: Contato[];
  escolhas: string[];
  verificacoes?: Verificado[];
  consentimento: true;
}

export interface PreCadastroCriado {
  id: number;
  protocolo: string;
  pontuacao: number;
  criado_em: string;
  n_escolhas: number;
  n_contatos: number;
}

export interface PreCadastro {
  protocolo: string;
  criado_em: string;
  nome_responsavel: string;
  nome_crianca?: string | null;
  nascimento_anomes: string;
  grupamento: string;
  horario: string;
  cep: string;
  bairro: string | null;
  pontuacao: number;
  respostas: Record<string, boolean>;
  contatos: Contato[];
  escolhas: { ordem: number; codigo: string; nome: string | null; bairro: string | null; distancia_km: number | null }[];
}

/* ---------- assistente (chat com tools) — POST /chat ---------- */
export interface ChatMensagem {
  role: "user" | "assistant";
  content: string;
}

export interface ChatPedido {
  area: "cre" | "sme";
  cre?: string;
  ator?: string;
  mensagens: ChatMensagem[];
}

export interface ChatFerramenta {
  nome: string;
  argumentos: Record<string, unknown>;
  /** linha mostrada ao servidor: "resumo do painel · 4ª CRE" */
  resumo: string;
  erro?: string | null;
}

/** a resposta já está num card do painel: o chat oferece levar o servidor até lá (rola e destaca) e mostra o resumo */
export interface ChatNavegacao {
  /** casa com o `data-secao` do card, ex.: "cre.para_hoje" */
  secao: string;
  pagina: string;
  titulo: string;
  rota: string;
  resumo: string;
}

export interface ChatResposta {
  resposta: string;
  ferramentas: ChatFerramenta[];
  navegacao?: ChatNavegacao | null;
  modelo: string;
  tokens_entrada?: number;
  tokens_saida?: number;
  log_id?: number | null;
}
