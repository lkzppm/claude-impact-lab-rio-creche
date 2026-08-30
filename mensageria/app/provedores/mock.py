"""Provedor simulado — o padrão. Não envia nada e devolve `simulado` com protocolo determinístico.

Existe pelo mesmo motivo de `backend/app/integracoes/mock.py`: desenvolver e demonstrar o fluxo inteiro
sem credencial de terceiro e sem mandar mensagem para ninguém. O protocolo é derivado do destino, então
o mesmo envio produz sempre o mesmo identificador — facilita o teste.
"""
from __future__ import annotations

import hashlib

from app.provedores.base import Mensagem, Resposta


class ProvedorMock:
    def __init__(self, canal: str) -> None:
        self.canal = canal
        self.nome = f"mock_{canal}"

    @property
    def configurado(self) -> bool:
        return True

    async def enviar(self, m: Mensagem) -> Resposta:
        semente = f"{self.nome}:{m.destino}:{m.texto}"
        sid = hashlib.sha1(semente.encode()).hexdigest()[:20].upper()
        return Resposta(
            resultado="simulado",
            protocolo=f"MOCK-{sid}",
            detalhe=f"{len(m.texto)} caracteres — nenhum envio real",
        )
