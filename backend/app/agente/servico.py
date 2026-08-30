"""Um turno do assistente: monta prompt + ferramentas para o escopo, roda o laço e grava o log de acesso."""
from __future__ import annotations

import contextlib
import hashlib
import logging
import time
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.agente import ferramentas as fer
from app.agente import prompts
from app.agente.escopo import Escopo
from app.agente.loop import ErroModelo, Turno, conversar
from app.config import Settings, get_settings
from app.models import ConsultaAgente

log = logging.getLogger("app.agente")


def preparar_historico(mensagens: list[dict[str, str]], maximo: int) -> list[dict[str, str]]:
    """Só texto, papéis válidos, começa em `user`, termina em `user`, no máximo `maximo` mensagens."""
    limpas = [{"role": m["role"], "content": m["content"].strip()} for m in mensagens
              if m.get("role") in ("user", "assistant") and (m.get("content") or "").strip()]
    while limpas and limpas[0]["role"] != "user":
        limpas.pop(0)
    while limpas and limpas[-1]["role"] != "user":
        limpas.pop()
    if not limpas:
        raise ValueError("a conversa precisa terminar com uma pergunta do usuário")
    if len(limpas) > maximo:
        limpas = limpas[-maximo:]
        while limpas and limpas[0]["role"] != "user":
            limpas.pop(0)
    return limpas


def responder(db: Session, escopo: Escopo, mensagens: list[dict[str, str]], chamar: Callable[[dict], Any],
              settings: Settings | None = None) -> tuple[Turno, int | None]:
    """Executa o turno e grava `consulta_agente`. Devolve (turno, id do log)."""
    s = settings or get_settings()
    historico = preparar_historico(mensagens, s.chat_max_historico)
    pergunta = historico[-1]["content"]
    catalogo = fer.catalogo(escopo)

    def executar(nome: str, args: dict) -> tuple[Any, str, str | None]:
        r = fer.executar(db, escopo, nome, args, ferramentas=catalogo)
        erro = r.dados.get("erro") if isinstance(r.dados, dict) else None
        return r.dados, r.resumo, erro

    t0 = time.perf_counter()
    turno: Turno | None = None
    resultado = "ok"
    try:
        turno = conversar(chamar, modelo=s.chat_model, system=prompts.sistema(escopo),
                          definicoes=[f.definicao() for f in catalogo.values()], mensagens=historico,
                          executar=executar, max_ferramentas=s.chat_max_tools, max_tokens=s.chat_max_tokens,
                          effort=s.chat_effort or None)
        if turno.parada == "refusal":
            resultado = "recusa"
    except ErroModelo:
        resultado = "erro"
        raise
    finally:
        log_id = _registrar(db, escopo, s.chat_model, pergunta, turno, resultado, int((time.perf_counter() - t0) * 1000))
    return turno, log_id


def _registrar(db: Session, escopo: Escopo, modelo_pedido: str, pergunta: str, turno: Turno | None,
               resultado: str, duracao_ms: int) -> int | None:
    """Log de acesso (LGPD). Guarda hash da pergunta e as ferramentas com argumentos; não guarda texto.
    Uma falha aqui é registrada no log da aplicação e não derruba a resposta ao servidor."""
    linha = ConsultaAgente(
        area=escopo.area, cre=escopo.cre, ator=escopo.ator,
        modelo=(turno.modelo if turno and turno.modelo else modelo_pedido),
        pergunta_hash=hashlib.sha256(pergunta.encode("utf-8")).hexdigest(), pergunta_chars=len(pergunta),
        ferramentas=[{"nome": c.nome, "argumentos": c.argumentos, **({"erro": c.erro} if c.erro else {})}
                     for c in (turno.ferramentas if turno else [])],
        tokens_entrada=turno.tokens_entrada if turno else None, tokens_saida=turno.tokens_saida if turno else None,
        duracao_ms=duracao_ms, resultado=resultado,
    )
    try:
        db.add(linha)
        db.commit()
        return linha.id
    except Exception:  # noqa: BLE001
        log.exception("falha ao gravar consulta_agente (área=%s cre=%s)", escopo.area, escopo.cre)
        with contextlib.suppress(Exception):
            db.rollback()
        return None
