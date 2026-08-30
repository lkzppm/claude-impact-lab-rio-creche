"""Escopo de quem pergunta. A regra de território é aplicada AQUI, no servidor — nunca se confia no modelo
para filtrar: na área `cre` toda ferramenta força a CRE do usuário e recusa dados de outra CRE."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Area = Literal["cre", "sme"]


class ForaDoEscopo(Exception):
    """A ferramenta foi chamada para um dado fora do território do usuário. Vira `{"erro": ...}` para o modelo."""


def _ordinal(cre: str | None) -> str:
    return f"{cre}ª CRE" if cre else "CRE"


@dataclass(frozen=True)
class Escopo:
    area: Area
    cre: str | None = None
    ator: str | None = None

    @property
    def restrito(self) -> bool:
        return self.area == "cre"

    @property
    def rotulo(self) -> str:
        return _ordinal(self.cre) if self.restrito else "rede inteira"

    def cre_efetiva(self, pedida: str | int | None) -> str | None:
        """CRE que a ferramenta deve usar. Área `cre`: sempre a do usuário — se o modelo pediu outra, erro
        explícito (o modelo explica ao servidor). Área `sme`: o que foi pedido (ou nada = rede)."""
        pedida_s = str(pedida).strip() if pedida not in (None, "") else None
        if self.restrito:
            if pedida_s and pedida_s != self.cre:
                raise ForaDoEscopo(
                    f"você só tem acesso à {_ordinal(self.cre)}; a {_ordinal(pedida_s)} e a comparação entre CREs "
                    "são visão do Nível Central")
            return self.cre
        return pedida_s

    def exigir_cre(self, cre_do_dado: str | None, o_que: str) -> None:
        """Rejeita um dado (unidade, convocação) que não é do território do usuário."""
        if self.restrito and (cre_do_dado is None or str(cre_do_dado) != self.cre):
            raise ForaDoEscopo(f"{o_que} não pertence à {_ordinal(self.cre)}")

    def exigir_alguma_cre(self, cres_do_dado: set[str], o_que: str) -> None:
        """Para dados ligados a várias unidades (inscrição com até 5 opções): basta uma opção na CRE."""
        if self.restrito and self.cre not in cres_do_dado:
            raise ForaDoEscopo(f"{o_que} não tem nenhuma opção nem convocação na {_ordinal(self.cre)}")
