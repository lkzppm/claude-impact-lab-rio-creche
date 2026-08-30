"""Assistente do painel (áreas CRE e Nível Central): POST /chat. Só leitura; o estado da conversa fica no
cliente (o histórico vem inteiro a cada turno). Sem ANTHROPIC_API_KEY → 503."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agente import secoes
from app.agente.cliente import AssistenteIndisponivel, chamador
from app.agente.escopo import Escopo
from app.agente.loop import ErroModelo
from app.agente.servico import responder
from app.db import get_db
from app.schemas import ChatFerramenta, ChatNavegacao, ChatPedido, ChatResposta

router = APIRouter(prefix="/chat", tags=["assistente"])


@router.post("", response_model=ChatResposta)
def perguntar(body: ChatPedido, db: Session = Depends(get_db)):
    try:
        chamar = chamador()
    except AssistenteIndisponivel as e:
        raise HTTPException(503, str(e)) from e
    cre = (body.cre or "").strip() or None
    if body.area == "cre" and not cre:
        raise HTTPException(422, "na área CRE é preciso informar a CRE (escolha-a no menu do painel)")
    escopo = Escopo(area=body.area, cre=cre if body.area == "cre" else None, ator=(body.ator or "").strip() or None)
    try:
        turno, log_id = responder(db, escopo, [m.model_dump() for m in body.mensagens], chamar)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except ErroModelo as e:
        raise HTTPException(e.status, e.detail) from e
    nav = secoes.navegacao(escopo, turno.ferramentas)
    return ChatResposta(
        resposta=turno.resposta,
        navegacao=ChatNavegacao(**nav) if nav else None,
        ferramentas=[ChatFerramenta(nome=c.nome, argumentos=c.argumentos, resumo=c.resumo, erro=c.erro) for c in turno.ferramentas],
        modelo=turno.modelo, tokens_entrada=turno.tokens_entrada, tokens_saida=turno.tokens_saida, log_id=log_id,
    )
