"""Ponte entre a API e o serviço de mensageria (`mensageria/`, container à parte).

Fina de propósito: quem sabe montar a mensagem é o catálogo do outro serviço, quem sabe quando avisar
são as features do backend. Este router só existe para (a) provar o caminho backend → mensageria de
ponta a ponta e (b) dar ao painel um endereço para disparar um aviso avulso.

A resposta sai como veio, sem esquema próprio: assim uma mensagem nova no catálogo da mensageria não
exige mexer aqui.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.integracoes import mensageria
from app.schemas import MensagemIn

router = APIRouter(prefix="/mensagens", tags=["mensagens"])


@router.get("/saude")
def saude() -> dict[str, Any]:
    """Provedor ativo em cada canal e se ele tem credencial. Não expõe as chaves."""
    return mensageria.saude()


@router.get("/templates")
def templates() -> dict[str, Any]:
    """Catálogo de mensagens com os dados obrigatórios de cada uma."""
    return mensageria.catalogo()


@router.post("/enviar")
def enviar(body: MensagemIn) -> dict[str, Any]:
    """Dispara um envio. Devolve 200 mesmo quando o provedor recusa — o desfecho vem em `resultado`
    (`enviado` · `simulado` · `pendente` · `falha`), porque aviso que não saiu não pode virar erro de
    API no meio de uma convocação."""
    return mensageria.enviar(
        body.canal, body.destino, body.template, body.dados,
        referencia=body.referencia, chave_idem=body.chave_idem, ator=body.ator,
    )
