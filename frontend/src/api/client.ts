import type {
  Alocacao,
  Capacidade,
  Comprovacao,
  Convocacao,
  ConvocacaoDetalhe,
  Evento,
  Explicacao,
  ExpirarVencidasResposta,
  FilaConvocacao,
  FilaUnidade,
  GerarConvocacoesResposta,
  MultiReservaItem,
  NovaCapacidade,
  Health,
  Inscricao,
  InscricaoDetalhe,
  Mapa,
  MensagemIn,
  MensagemResultado,
  MotorEstado,
  Resposta,
  NovaRodada,
  NovoEvento,
  Paginated,
  PainelResumo,
  PainelUnidade,
  Pergunta,
  Processo,
  Rodada,
  Unidade,
  UnidadeDetalhe,
} from "./types";

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(params?: Query): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError(0, `Sem resposta do servidor em ${API_URL}. O backend está no ar?`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* corpo não é JSON */
    }
    throw new ApiError(res.status, `${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const get = <T>(path: string, params?: Query) => request<T>(`${path}${qs(params)}`);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });

/* ---------- health / processos ---------- */
export const getHealth = () => get<Health>("/health");
export const getProcessos = () => get<Processo[]>("/processos");
export const getRegua = (ano: number) => get<Pergunta[]>(`/processos/${ano}/regua`);

/* ---------- unidades ---------- */
export const getUnidades = (params?: { cre?: string; q?: string; limit?: number }) =>
  get<Unidade[]>("/unidades", params);
export const getUnidade = (codigo: string) => get<UnidadeDetalhe>(`/unidades/${encodeURIComponent(codigo)}`);
export const getFilaUnidade = (codigo: string, params?: { grupamento?: string; horario?: string; limit?: number }) =>
  get<FilaUnidade>(`/unidades/${encodeURIComponent(codigo)}/fila`, params);
export const informarCapacidade = (codigo: string, body: NovaCapacidade) =>
  put<Capacidade>(`/unidades/${encodeURIComponent(codigo)}/capacidade`, body);

/* ---------- inscrições ---------- */
export const getInscricoes = (params?: { ano?: number; unidade?: string; situacao?: string; page?: number; size?: number }) =>
  get<Paginated<Inscricao>>("/inscricoes", params);
export const getInscricao = (id: number) => get<InscricaoDetalhe>(`/inscricoes/${id}`);
export const getComprovacoes = (id: number) => get<Comprovacao[]>(`/inscricoes/${id}/comprovacoes`);
export const comprovarInscricao = (id: number) => post<Comprovacao[]>(`/inscricoes/${id}/comprovar`);
export const confirmarResposta = (inscricaoId: number, ichPergId: number, confirmado: boolean, ator?: string) =>
  request<Resposta>(`/inscricoes/${inscricaoId}/respostas/${ichPergId}`, {
    method: "PATCH",
    body: JSON.stringify({ confirmado, ator }),
  });

/* ---------- classificação ---------- */
export const getRodadas = () => get<Rodada[]>("/classificacao/rodadas");
export const getRodada = (id: number) => get<Rodada>(`/classificacao/rodadas/${id}`);
export const criarRodada = (body: NovaRodada) => post<Rodada>("/classificacao/rodadas", body);
export const getAlocacoes = (
  rodadaId: number,
  params?: { unidade?: string; status?: string; page?: number; size?: number },
) => get<Paginated<Alocacao>>(`/classificacao/rodadas/${rodadaId}/alocacoes`, params);
export const getExplicacao = (rodadaId: number, inscricaoId: number) =>
  get<Explicacao>(`/classificacao/rodadas/${rodadaId}/explicacao/${inscricaoId}`);

/* ---------- convocações ---------- */
export const gerarConvocacoes = (rodada_id: number) =>
  post<GerarConvocacoesResposta>("/convocacoes/gerar", { rodada_id });
export const getConvocacoes = (params?: {
  cre?: string;
  unidade?: string;
  status?: string;
  atrasadas?: boolean;
  fila?: FilaConvocacao;
  page?: number;
  size?: number;
}) => get<Paginated<Convocacao>>("/convocacoes", params);
export const getConvocacao = (id: number) => get<ConvocacaoDetalhe>(`/convocacoes/${id}`);
export const registrarEvento = (id: number, body: NovoEvento) =>
  post<{ status: string; evento: Evento; convocacao: ConvocacaoDetalhe }>(`/convocacoes/${id}/eventos`, body);
export const expirarVencidas = (body: { cre?: string; unidade?: string; ator?: string | null }) =>
  post<ExpirarVencidasResposta>("/convocacoes/expirar-vencidas", body);
export const convocarProximo = (id: number, ator?: string | null) =>
  post<ConvocacaoDetalhe>(`/convocacoes/${id}/convocar-proximo`, { ator });

/* ---------- motor contínuo ---------- */
export const getMotor = () => get<MotorEstado>("/motor");
export const rodarCicloMotor = () => post<MotorEstado>("/motor/ciclo");

/* ---------- painel ---------- */
export const getMapa = (params?: { cre?: string; ano?: number }) => get<Mapa>("/painel/mapa", params);
export const getPainelResumo = (params?: { cre?: string; unidade?: string }) =>
  get<PainelResumo>("/painel/resumo", params);
export const getPainelUnidades = (params?: { cre?: string }) => get<PainelUnidade[]>("/painel/unidades", params);
export const getMultiReserva = (params?: { cre?: string; unidade?: string; limit?: number }) =>
  get<MultiReservaItem[]>("/painel/multireserva", params);

/* ---------- família ---------- */
import type { FamiliaInscricao, FamiliaResposta, PainelCre } from "./types";
export const getFamiliaInscricao = (codigo: string, ano?: number) =>
  get<FamiliaInscricao>("/familia/inscricao", { codigo, ano });
export const responderConvocacao = (id: number, resposta: FamiliaResposta) =>
  post<{ status: string; evento: Evento }>(`/familia/convocacoes/${id}/responder`, { resposta });

/* ---------- rede (Nível Central) ---------- */
export const getPainelCres = (params?: { ano?: number }) => get<PainelCre[]>("/painel/cres", params);

/* ---------- mensageria (WhatsApp / e-mail / SMS) ---------- */
export const enviarMensagem = (body: MensagemIn) => post<MensagemResultado>("/mensagens/enviar", body);

/* ---------- assistente (chat com tools) ---------- */
import type { ChatPedido, ChatResposta } from "./types";
export const perguntarAssistente = (body: ChatPedido) => post<ChatResposta>("/chat", body);
/* ---------- pré-cadastro (família) ---------- */
import type { GeoCep, PreCadastro, PreCadastroCriado, PreCadastroIn, ReguaFamilia, Sugestoes, SugestoesIn, Verificacao } from "./types";
export const getReguaFamilia = () => get<ReguaFamilia>("/familia/regua");
export const getGeoCep = (cep: string) => get<GeoCep>(`/geo/cep/${encodeURIComponent(cep)}`);
export const getSugestoes = (body: SugestoesIn) => post<Sugestoes>("/familia/sugestoes", body);
export const criarPreCadastro = (body: PreCadastroIn) => post<PreCadastroCriado>("/familia/pre-cadastro", body);
export const getPreCadastro = (protocolo: string) =>
  get<PreCadastro>(`/familia/pre-cadastro/${encodeURIComponent(protocolo)}`);
export const verificarCpf = (cpf: string, nascimento_anomes?: string) =>
  post<Verificacao>("/familia/verificar", { cpf, nascimento_anomes: nascimento_anomes || undefined });
