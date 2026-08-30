"""Normalização, mascaramento e impressão digital do destino.

O destino (celular ou e-mail do responsável) é dado pessoal. Este módulo garante que:
- o provedor recebe o valor **normalizado** (E.164 para telefone, minúsculo para e-mail);
- o log recebe o valor **mascarado** e uma **impressão digital** (hash), nunca o valor em claro
  (minimização — LGPD art. 14, `spec/05`).
"""
from __future__ import annotations

import hashlib
import re

CANAIS = ("whatsapp", "email", "sms")
_SO_DIGITOS = re.compile(r"\D+")
# Deliberadamente permissivo: rejeita o que claramente não é endereço, não valida a caixa postal.
_EMAIL = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")

DDD_BRASIL = {
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68,
    69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95,
    96, 97, 98, 99,
}


def normalizar_telefone(valor: str) -> str:
    """Devolve o telefone em E.164 (`+5524999441846`).

    Aceita `(24) 99944-1846`, `24999441846`, `5524999441846` e `+55 24 99944-1846`.
    Número sem código de país é assumido brasileiro — o serviço é da Prefeitura do Rio.
    O nono dígito **não** é removido: quem informou o número informa como ele existe hoje.
    """
    bruto = (valor or "").strip()
    internacional = bruto.startswith("+") and not bruto.startswith("+55")
    d = _SO_DIGITOS.sub("", bruto)
    if not d:
        raise ValueError("telefone vazio")

    if internacional:
        if not 8 <= len(d) <= 15:
            raise ValueError(f"telefone internacional com {len(d)} dígitos (esperado 8 a 15)")
        return f"+{d}"

    if d.startswith("55") and len(d) in (12, 13):
        nacional = d[2:]
    elif len(d) in (10, 11):
        nacional = d
    else:
        raise ValueError(
            f"telefone com {len(d)} dígitos: use DDD + número (10 ou 11 dígitos) ou o formato E.164"
        )

    if int(nacional[:2]) not in DDD_BRASIL:
        raise ValueError(f"DDD {nacional[:2]} não existe no Brasil")
    return f"+55{nacional}"


def normalizar_email(valor: str) -> str:
    e = (valor or "").strip().lower()
    if not _EMAIL.match(e):
        raise ValueError("e-mail inválido")
    return e


def normalizar(canal: str, valor: str) -> str:
    if canal not in CANAIS:
        raise ValueError(f"canal inválido: {canal!r} (opções: {', '.join(CANAIS)})")
    return normalizar_email(valor) if canal == "email" else normalizar_telefone(valor)


def mascarar(canal: str, valor: str) -> str:
    """`+5524999441846` → `+5524*****1846`; `fulano@exemplo.com` → `f****o@exemplo.com`."""
    if canal == "email":
        usuario, _, dominio = valor.partition("@")
        if len(usuario) <= 2:
            visivel = usuario[:1] or "*"
            return f"{visivel}***@{dominio}"
        return f"{usuario[0]}{'*' * (len(usuario) - 2)}{usuario[-1]}@{dominio}"
    if len(valor) <= 8:
        return valor[:3] + "*" * (len(valor) - 3)
    return f"{valor[:5]}{'*' * (len(valor) - 9)}{valor[-4:]}"


def impressao(valor: str) -> str:
    """Impressão digital estável do destino: correlaciona envios sem guardar o endereço."""
    return hashlib.sha256(valor.encode("utf-8")).hexdigest()[:16]
