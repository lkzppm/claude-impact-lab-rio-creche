"""Seleciona o provedor ativo de cada canal.

    MENSAGERIA_WHATSAPP=mock (padrão) | twilio
    MENSAGERIA_EMAIL=mock (padrão) | resend | smtp
    MENSAGERIA_SMS=mock (padrão) | twilio

Padrão `mock` em tudo pelo mesmo motivo de `COMPROVACAO_PROVIDER=mock` no backend: subir o repositório
limpo não pode mandar mensagem para ninguém. Trocar de provedor é mudar a variável, não o código.
"""
from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.provedores.base import ProvedorMensageria
from app.provedores.mock import ProvedorMock
from app.provedores.resend import ProvedorResend
from app.provedores.smtp import ProvedorSMTP
from app.provedores.twilio import ProvedorTwilio

_FABRICAS: dict[str, dict[str, callable]] = {
    "whatsapp": {"mock": lambda: ProvedorMock("whatsapp"), "twilio": lambda: ProvedorTwilio("whatsapp")},
    "email": {"mock": lambda: ProvedorMock("email"), "resend": ProvedorResend, "smtp": ProvedorSMTP},
    "sms": {"mock": lambda: ProvedorMock("sms"), "twilio": lambda: ProvedorTwilio("sms")},
}


@lru_cache
def _construir(canal: str, nome: str) -> ProvedorMensageria:
    return _FABRICAS[canal][nome]()


def escolhido(canal: str) -> str:
    s = get_settings()
    nome = {"whatsapp": s.mensageria_whatsapp, "email": s.mensageria_email, "sms": s.mensageria_sms}[canal]
    nome = nome.strip().lower()
    if nome not in _FABRICAS[canal]:
        raise RuntimeError(
            f"provedor desconhecido para {canal}: {nome!r} (opções: {', '.join(_FABRICAS[canal])})"
        )
    return nome


def provedor(canal: str) -> ProvedorMensageria:
    if canal not in _FABRICAS:
        raise RuntimeError(f"canal desconhecido: {canal!r}")
    return _construir(canal, escolhido(canal))


def panorama() -> dict[str, dict[str, object]]:
    """Uma linha por canal, para `GET /saude` — sem expor credencial."""
    fora = {}
    for canal in _FABRICAS:
        try:
            p = provedor(canal)
            fora[canal] = {"provedor": p.nome, "configurado": p.configurado,
                           "modo": "simulado" if p.nome.startswith("mock_") else "real"}
        except RuntimeError as exc:
            fora[canal] = {"provedor": None, "configurado": False, "erro": str(exc)}
    return fora


def validar() -> None:
    """Falha na subida se alguma variável apontar para provedor inexistente — erro de configuração
    não pode virar mensagem não enviada em silêncio."""
    for canal in _FABRICAS:
        escolhido(canal)
