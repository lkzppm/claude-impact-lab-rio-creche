"""Interface dos provedores de envio.

Um provedor fala com UM serviço externo (Twilio, Resend, um relay SMTP) para UM canal e devolve uma
`Resposta`. Para plugar outro, implemente `ProvedorMensageria` neste pacote e registre em `registry.py`.

Regras (as mesmas de `backend/app/integracoes/base.py`):
- **Nunca lançar exceção para fora**: falha de rede/timeout vira `resultado='falha'` com `permanente=False`.
- Sem credencial, `configurado` é `False` e o envio devolve `pendente` — nunca falha ruidosamente.
- `detalhe` carrega a mensagem do provedor **verbatim**, para o painel não inventar diagnóstico.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class Mensagem:
    """O que o provedor precisa saber. Já normalizado e renderizado.

    `template` e `dados` vêm junto porque o WhatsApp não aceita texto livre fora da janela de 24 h: o
    provedor precisa saber **qual** template usar e com que valores preencher os campos posicionais dele
    (`ContentSid` + `ContentVariables`). Quem só manda texto ignora os dois.
    """
    canal: str
    destino: str                    # E.164 ou e-mail
    assunto: str
    texto: str
    html: str
    template: str = ""
    dados: dict[str, object] = field(default_factory=dict)
    chave_idem: str | None = None
    referencia: str | None = None


@dataclass(frozen=True)
class Resposta:
    resultado: str                  # enviado | simulado | pendente | falha
    protocolo: str | None = None    # id do provedor (Twilio sid, Resend id)
    detalhe: str | None = None
    permanente: bool = True         # False = erro transitório, vale repetir


@runtime_checkable
class ProvedorMensageria(Protocol):
    nome: str
    canal: str

    @property
    def configurado(self) -> bool: ...

    async def enviar(self, m: Mensagem) -> Resposta: ...


NAO_CONFIGURADO = "provedor sem credencial — nada foi enviado"
