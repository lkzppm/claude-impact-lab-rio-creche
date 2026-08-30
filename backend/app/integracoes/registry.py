"""Seleciona os provedores ativos. `COMPROVACAO_PROVIDER=mock` (padrão) | `conecta` | `rmi` | `todos`.

Para plugar um adaptador real: implemente `ProvedorComprovacao` (base.py) em um módulo deste pacote e
registre-o em `_FABRICAS` abaixo.
"""
from __future__ import annotations

import os

from app.integracoes.base import ProvedorComprovacao
from app.integracoes.conecta import PROVEDORES_CONECTA
from app.integracoes.mock import PROVEDORES_MOCK
from app.integracoes.rmi import PROVEDORES_RMI

_FABRICAS: dict[str, callable] = {
    "mock": lambda: list(PROVEDORES_MOCK),
    # Reais: sem credencial (CONECTA_* / GOOGLE_APPLICATION_CREDENTIALS) devolvem `pendente`, nunca falham.
    "conecta": lambda: [cls() for cls in PROVEDORES_CONECTA],
    "rmi": lambda: [cls() for cls in PROVEDORES_RMI],
}


def provedores() -> list[ProvedorComprovacao]:
    nome = os.getenv("COMPROVACAO_PROVIDER", "mock").strip().lower()
    if nome == "todos":
        out: list[ProvedorComprovacao] = []
        for f in _FABRICAS.values():
            out.extend(f())
        return out
    if nome not in _FABRICAS:
        raise RuntimeError(f"COMPROVACAO_PROVIDER desconhecido: {nome!r} (opções: {', '.join(_FABRICAS)}, todos)")
    return _FABRICAS[nome]()
