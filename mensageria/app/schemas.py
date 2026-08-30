"""Contrato da API. O backend só conhece estes dois objetos."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Canal = Literal["whatsapp", "email", "sms"]

# enviado  — o provedor aceitou a mensagem (protocolo devolvido)
# simulado — provedor `mock`: nada saiu, o fluxo foi exercitado
# pendente — provedor real sem credencial; o backend segue, ninguém foi avisado
# falha    — o provedor recusou ou não respondeu; `detalhe` explica
RESULTADOS = ("enviado", "simulado", "pendente", "falha")


class PedidoEnvio(BaseModel):
    canal: Canal
    destino: str = Field(min_length=3, description="celular (E.164 ou DDD+número) ou e-mail")
    template: str = Field(description="nome no catálogo — GET /api/v1/templates")
    dados: dict[str, Any] = Field(default_factory=dict)
    referencia: str | None = Field(
        default=None, max_length=64,
        description="correlação sem dado pessoal, ex.: 'convocacao:1234'. Vai para o log.",
    )
    chave_idem: str | None = Field(
        default=None, max_length=128,
        description="mesma chave em 24 h não reenvia — devolve o resultado anterior com repetido=true",
    )
    ator: str = Field(default="sistema", max_length=64)


class LoteEnvio(BaseModel):
    mensagens: list[PedidoEnvio] = Field(min_length=1)


class ResultadoEnvio(BaseModel):
    id: str
    canal: str
    template: str
    destino: str = Field(description="mascarado — o valor em claro nunca sai daqui")
    destino_id: str = Field(description="impressão digital (sha256 truncado) do destino")
    provedor: str
    resultado: str
    protocolo: str | None = None
    detalhe: str | None = None
    repetido: bool = False
    tentativas: int = 1
    duracao_ms: int = 0
    referencia: str | None = None
    registrado_em: str


class PedidoRecusado(BaseModel):
    indice: int = Field(description="posição do pedido na lista enviada")
    erro: str


class LoteResultado(BaseModel):
    total: int
    por_resultado: dict[str, int]
    mensagens: list[ResultadoEnvio]
    invalidos: list[PedidoRecusado] = Field(
        default_factory=list,
        description="pedidos que não viraram mensagem; a posição permite corrigir na origem",
    )


class Saude(BaseModel):
    status: str
    versao: str
    canais: dict[str, dict[str, Any]]
    templates: int
