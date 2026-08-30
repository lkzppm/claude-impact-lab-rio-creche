"""Esquemas Pydantic da API (spec/11-baseline-tecnico.md)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class Pagina(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


class Health(BaseModel):
    status: str
    db: str
    versao: str


class PerguntaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ano: int
    ich_perg_id: int
    perg_id: int | None
    texto: str
    pontuacao: int
    criterio_desempate: bool
    ordem: int | None


class ProcessoOut(BaseModel):
    ano: int
    prm_id: int
    descricao: str | None
    n_inscricoes: int
    n_perguntas: int
    pontuacao_maxima: int


class CapacidadeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ano: int
    grupamento: str
    horario: str
    vagas: int
    fonte: str


class UnidadeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    codigo: str
    nome: str | None
    tipo: str | None
    logradouro: str | None = None
    numero: str | None = None
    bairro: str | None
    cep: str | None = None
    cre: str | None
    microarea: str | None = None
    polo: str | None = None
    lat: float | None
    lon: float | None


class UnidadeDetalhe(UnidadeOut):
    capacidade: list[CapacidadeOut] = []


class OpcaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ordem: int
    unidade_codigo: str
    unidade_nome: str | None = None
    grupamento: str
    horario: str
    situacao_origem: str | None


class RespostaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ich_perg_id: int
    texto: str | None = None
    resposta: bool
    confirmado: bool
    pontuacao: int | None = None


class InscricaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ano: int
    prm_id: int
    plm_id: int
    ipl_id: int
    aluno_anon: str | None
    responsavel_anon: str | None
    nascimento_anomes: str | None
    sexo: str | None
    cep: str | None
    bairro: str | None
    data_criacao: datetime | None
    pontuacao: int


class InscricaoDetalhe(InscricaoOut):
    opcoes: list[OpcaoOut] = []
    respostas: list[RespostaOut] = []


class RodadaIn(BaseModel):
    ano: int
    grupamento: str | None = None
    horario: str | None = None
    tipo: str = Field(default="inicial", pattern="^(inicial|rematch)$")
    vagas_presas: int = Field(default=3, ge=1, le=5)
    alternativas: int = Field(default=2, ge=0, le=5)


class RodadaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ano: int
    tipo: str
    criada_em: datetime
    parametros: dict[str, Any] | None
    hash_entrada: str | None
    resumo: dict[str, Any] | None


class AlocacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rodada_id: int
    inscricao_id: int
    aluno_anon: str | None = None
    unidade_nome: str | None = None
    opcao_id: int | None
    unidade_codigo: str | None
    grupamento: str
    horario: str
    status: str
    tipo: str | None
    posicao_fila: int | None
    pontuacao: int
    motivo: dict[str, Any] | None
    vaga_liberada: bool


class Explicacao(BaseModel):
    inscricao_id: int
    rodada_id: int
    status: str
    texto: str
    motivo: dict[str, Any] | None


class GerarConvocacoesIn(BaseModel):
    rodada_id: int


class EventoIn(BaseModel):
    # vocabulário do frontend (tentativa_contato…) ou do status (contato_tentado…) — os dois são aceitos
    tipo: str = Field(pattern="^(tentativa_contato|contato_tentado|contato_confirmado|matricula_confirmada|confirmada|"
                              "recusa|recusada|expiracao|expirada)$")
    payload: dict[str, Any] | None = None
    ator: str | None = None


class EventoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ocorrido_em: datetime
    tipo: str
    convocacao_id: int | None
    inscricao_id: int | None
    unidade_codigo: str | None
    ator: str | None
    payload: dict[str, Any] | None


class ConvocacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    alocacao_id: int
    inscricao_id: int
    unidade_codigo: str
    unidade_nome: str | None = None
    cre: str | None = None
    grupamento: str
    horario: str
    status: str
    prazo_fim: datetime | None
    criada_em: datetime
    atualizada_em: datetime
    horas_no_status: float | None = None
    atrasada: bool = False
    n_tentativas: int = 0
    aluno_anon: str | None = None
    pontuacao: int | None = None


class ConvocacaoIrma(BaseModel):
    id: int
    unidade_codigo: str
    unidade_nome: str | None
    status: str


class ConvocacaoDetalhe(ConvocacaoOut):
    eventos: list[EventoOut] = []
    irmas: list[ConvocacaoIrma] = []


class EventoRegistrado(BaseModel):
    status: str
    evento: EventoOut
    convocacao: ConvocacaoDetalhe


class SelecionadasAguardando(BaseModel):
    total: int
    faixa_0_24h: int
    faixa_24_48h: int
    faixa_48_72h: int
    faixa_mais_72h: int


class PainelResumo(BaseModel):
    filtro: dict[str, Any]
    atualizado_em: datetime
    selecionadas_aguardando: SelecionadasAguardando
    vagas_em_risco: int                    # selecionadas com prazo vencido ou > 72h sem confirmação
    sem_contato: int                       # selecionadas sem nenhum contato_confirmado
    inconsistencias: int                   # inscrições com convocação confirmada E outra ainda aberta
    vagas_presas_por_crianca: float        # média de convocações abertas por criança com alguma aberta
    vagas_liberadas_hoje: int              # eventos recusada/expirada/liberada_por_confirmacao de hoje
    confirmadas: int
    recusadas: int
    expiradas: int
    vagas_liberadas: int


class ComprovacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    inscricao_id: int
    criterio: str
    fonte: str
    resultado: str
    protocolo: str | None
    consultado_em: datetime
    payload: dict[str, Any] | None


class PainelUnidade(BaseModel):
    unidade_codigo: str
    unidade_nome: str | None
    cre: str | None
    vagas: int
    alocadas: int
    convocadas: int
    confirmadas: int
    em_atraso: int
    liberadas: int


# ----------------------------------------------------------------------------- visão da família

class RodadaRef(BaseModel):
    id: int
    criada_em: datetime
    tipo: str


class FamiliaInscricao(BaseModel):
    id: int
    ano: int
    aluno_anon: str | None
    nascimento_anomes: str | None
    grupamento: str | None
    horario: str | None
    bairro: str | None
    pontuacao: int
    data_criacao: datetime | None


class FamiliaCriterio(BaseModel):
    ich_perg_id: int
    texto: str
    pontos: int
    desempate: bool = False
    declarado: bool
    comprovado: str | None = None          # confirmado | nao_encontrado | pendente | erro | None (sem verificação)


class FamiliaPontuacao(BaseModel):
    total: int
    maxima: int
    criterios: list[FamiliaCriterio]


class FamiliaOpcao(BaseModel):
    ordem: int
    unidade_codigo: str
    unidade_nome: str | None
    bairro: str | None
    situacao_origem: str | None
    resultado: str | None                  # reservada | fila | sem_vaga | None (não classificada)
    posicao: int | None


class FamiliaConvocacao(BaseModel):
    id: int
    unidade_codigo: str
    unidade_nome: str | None
    status: str
    prazo_fim: datetime | None
    horas_restantes: float | None
    pode_responder: bool


class FamiliaVisao(BaseModel):
    inscricao: FamiliaInscricao
    pontuacao: FamiliaPontuacao
    opcoes: list[FamiliaOpcao]
    rodada: RodadaRef | None
    explicacao: str | None
    convocacoes: list[FamiliaConvocacao]
    comprovacoes: list[ComprovacaoOut]
    situacao_resumo: str                   # reservas_abertas | matricula_confirmada | lista_espera | sem_opcao_viavel | aguardando_classificacao


class FamiliaResposta(BaseModel):
    resposta: str = Field(pattern="^(confirmar|recusar)$")


# ----------------------------------------------------------------------------- nível central: por CRE

class PainelCre(BaseModel):
    cre: str
    unidades: int
    vagas: int
    inscricoes: int
    alocadas: int
    convocadas: int
    abertas: int
    confirmadas: int
    em_atraso: int
    lista_espera: int


# ----------------------------------------------------------------------------- pré-cadastro da família

class ReguaPergunta(BaseModel):
    ich_perg_id: int
    texto: str
    pontos: int
    desempate: bool
    automatico: bool = False                 # verificado por API oficial a partir do CPF
    fonte_automatica: str | None = None


class ReguaFamilia(BaseModel):
    ano: int
    maxima: int
    perguntas: list[ReguaPergunta]


class GeoEndereco(BaseModel):
    cep: str
    logradouro: str | None
    bairro: str | None
    cidade: str | None
    uf: str | None
    lat: float | None
    lon: float | None
    fonte: str


class SugestoesIn(BaseModel):
    cep: str | None = None
    lat: float | None = None
    lon: float | None = None
    grupamento: str
    horario: str
    respostas: dict[str, bool] = Field(default_factory=dict)
    ano: int | None = None


class PontuacaoItem(BaseModel):
    ich_perg_id: int
    texto: str
    pontos: int


class PontuacaoEstimada(BaseModel):
    total: int
    maxima: int
    itens: list[PontuacaoItem]


class CasaOut(BaseModel):
    lat: float
    lon: float
    bairro: str | None
    fonte: str


class UnidadeSugerida(BaseModel):
    codigo: str
    nome: str | None
    bairro: str | None
    lat: float
    lon: float
    distancia_km: float
    vagas: int
    corte: int | None
    taxa_pct: float | None                   # % de crianças com até a sua pontuação que conseguiram vaga aqui
    n_base: int                              # quantos casos sustentam a taxa
    chance: str                              # alta | media | baixa | sem_vaga
    ordem_sugerida: int


class SugestoesOut(BaseModel):
    pontuacao: PontuacaoEstimada
    regua_ano: int
    casa: CasaOut | None
    unidades: list[UnidadeSugerida]


class ContatoIn(BaseModel):
    nome: str = Field(min_length=2)
    parentesco: str | None = None
    canal: str = Field(pattern="^(celular|whatsapp|email)$")
    valor: str = Field(min_length=5)
    principal: bool = False


class ContatoOut(ContatoIn):
    id: int
    verificado_em: datetime | None = None


class PreCadastroIn(BaseModel):
    cpf: str = Field(min_length=11)
    nome_responsavel: str = Field(min_length=3)
    nome_crianca: str | None = None
    nascimento_anomes: str = Field(pattern=r"^\d{4}-\d{2}$")
    grupamento: str
    horario: str
    cep: str
    cep_alternativo: str | None = None
    lat: float | None = None
    lon: float | None = None
    respostas: dict[str, bool] = Field(default_factory=dict)
    contatos: list[ContatoIn] = Field(min_length=1)
    escolhas: list[str] = Field(min_length=1, max_length=5)
    verificacoes: list[dict[str, Any]] | None = None
    consentimento: bool


class PreCadastroCriado(BaseModel):
    id: int
    protocolo: str
    pontuacao: int
    criado_em: datetime
    n_escolhas: int
    n_contatos: int


class EscolhaOut(BaseModel):
    ordem: int
    codigo: str
    nome: str | None
    bairro: str | None
    distancia_km: float | None


class PreCadastroOut(BaseModel):
    protocolo: str
    criado_em: datetime
    nome_responsavel: str
    nome_crianca: str | None
    nascimento_anomes: str
    grupamento: str
    horario: str
    cep: str
    bairro: str | None
    lat: float | None
    lon: float | None
    regua_ano: int
    pontuacao: int
    respostas: dict[str, bool]
    verificacoes: list[dict[str, Any]] | None = None
    contatos: list[ContatoOut]
    escolhas: list[EscolhaOut]


class VerificarIn(BaseModel):
    cpf: str = Field(min_length=11)
    nascimento_anomes: str | None = None


class CriterioVerificado(BaseModel):
    criterio: str
    fonte: str
    resultado: str                           # confirmado | nao_encontrado | erro | pendente
    protocolo: str | None
    ich_perg_id: int | None
    texto: str | None
    pontos: int
    bloqueia_manual: bool                    # True: a resposta é a da API; False: família ainda pode marcar (ex.: laudo)


class VerificacaoOut(BaseModel):
    verificados: list[CriterioVerificado]
    respostas_automaticas: dict[str, bool]
