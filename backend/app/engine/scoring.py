"""Pontuação de uma inscrição a partir das respostas × régua do ano.

A régua é norma (Res. SME 542/2025 para 2026; QueryC para 2021–2025), nunca parâmetro editável.
Só `resposta = Sim` pontua. Perguntas com `criterio_desempate` não somam ponto: viram flags de
desempate, na ordem da régua.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ItemRegua:
    ich_perg_id: int
    pontuacao: int
    criterio_desempate: bool
    ordem: int


@dataclass(frozen=True)
class Pontuacao:
    total: int
    desempate: tuple[int, ...]
    itens: tuple[tuple[int, int], ...]   # (ich_perg_id, pontos) que somaram


def pontuar(respostas: dict[int, bool], regua: list[ItemRegua]) -> Pontuacao:
    """`respostas`: ich_perg_id → True (Sim) / False (Nao). Perguntas fora da régua são ignoradas."""
    total = 0
    itens: list[tuple[int, int]] = []
    desempate: list[int] = []
    for item in sorted(regua, key=lambda r: (r.ordem, r.ich_perg_id)):
        sim = bool(respostas.get(item.ich_perg_id, False))
        if item.criterio_desempate:
            desempate.append(1 if sim else 0)
        elif sim and item.pontuacao > 0:
            total += item.pontuacao
            itens.append((item.ich_perg_id, item.pontuacao))
    return Pontuacao(total=total, desempate=tuple(desempate), itens=tuple(itens))
