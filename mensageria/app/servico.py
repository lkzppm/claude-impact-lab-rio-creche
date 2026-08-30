"""Orquestração do envio: valida → renderiza → idempotência → provedor (com repetição) → log.

A regra que atravessa tudo: **erro de programação falha alto, erro de mundo falha baixo.**

- Template inexistente, dado faltando no template, destino malformado → `PedidoInvalido` → HTTP 422.
  São bugs do chamador e precisam aparecer antes de a mensagem existir.
- Twilio fora do ar, credencial ausente, e-mail recusado → `ResultadoEnvio` com `resultado='falha'`
  ou `'pendente'` e HTTP 200. O backend registra e segue: convocação não pode cair porque um
  provedor de mensagem caiu.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone

from app import destinos, idempotencia, registro, templates
from app.config import get_settings
from app.provedores import Mensagem, provedor
from app.provedores.registry import escolhido
from app.schemas import PedidoEnvio, ResultadoEnvio


class PedidoInvalido(ValueError):
    """O pedido não pode virar mensagem. Culpa do chamador, não do provedor."""


def _agora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def enviar(pedido: PedidoEnvio) -> ResultadoEnvio:
    s = get_settings()
    inicio = time.perf_counter()

    # 1. Validação — tudo que é culpa do chamador acontece aqui, antes de qualquer efeito externo.
    try:
        destino = destinos.normalizar(pedido.canal, pedido.destino)
    except ValueError as exc:
        raise PedidoInvalido(f"destino inválido para o canal {pedido.canal}: {exc}") from exc
    try:
        modelo = templates.obter(pedido.template)
    except KeyError as exc:
        raise PedidoInvalido(exc.args[0]) from exc
    try:
        assunto, texto, html = modelo.render(pedido.dados)
    except ValueError as exc:
        raise PedidoInvalido(str(exc)) from exc

    mascarado, digital = destinos.mascarar(pedido.canal, destino), destinos.impressao(destino)
    base = {"canal": pedido.canal, "template": pedido.template, "destino": mascarado,
            "destino_id": digital, "referencia": pedido.referencia}

    # 2. Idempotência — a mesma chave em 24 h devolve o resultado anterior, sem tocar no provedor.
    chave = f"{pedido.canal}:{pedido.chave_idem}" if pedido.chave_idem else None
    if chave and (anterior := idempotencia.obter(chave, s.mensageria_idem_ttl_s)):
        repetido = {**anterior, "repetido": True, "registrado_em": _agora_iso(),
                    "duracao_ms": int((time.perf_counter() - inicio) * 1000)}
        registro.registrar(repetido, pedido.ator)
        return ResultadoEnvio(**repetido)

    # 3. Envio, com repetição só para erro transitório.
    p = provedor(pedido.canal)
    mensagem = Mensagem(canal=pedido.canal, destino=destino, assunto=assunto, texto=texto, html=html,
                        template=pedido.template, dados=dict(pedido.dados),
                        chave_idem=pedido.chave_idem, referencia=pedido.referencia)
    resposta, tentativas = None, 0
    for tentativa in range(1, max(1, s.mensageria_tentativas) + 1):
        tentativas = tentativa
        try:
            resposta = await p.enviar(mensagem)
        except Exception as exc:  # noqa: BLE001 — provedor nunca derruba o serviço
            from app.provedores.base import Resposta
            resposta = Resposta("falha", detalhe=f"erro inesperado no provedor: {type(exc).__name__}: {exc}")
        if resposta.resultado != "falha" or resposta.permanente:
            break
        if tentativa < s.mensageria_tentativas:
            await asyncio.sleep(s.mensageria_backoff_s * (2 ** (tentativa - 1)))

    resultado = {
        **base,
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "provedor": p.nome,
        "resultado": resposta.resultado,
        "protocolo": resposta.protocolo,
        "detalhe": resposta.detalhe,
        "repetido": False,
        "tentativas": tentativas,
        "duracao_ms": int((time.perf_counter() - inicio) * 1000),
        "registrado_em": _agora_iso(),
    }

    # 4. Só o que saiu de fato entra no cache: repetir um envio que falhou é o comportamento desejado.
    if chave and resposta.resultado in ("enviado", "simulado"):
        idempotencia.guardar(chave, resultado, s.mensageria_idem_max)

    registro.registrar(resultado, pedido.ator)
    return ResultadoEnvio(**resultado)


async def enviar_lote(pedidos: list[PedidoEnvio]) -> list[ResultadoEnvio | PedidoInvalido]:
    """Envia em paralelo com teto de concorrência. Um pedido inválido não cancela os outros —
    volta como `PedidoInvalido` na posição dele, para o chamador ver o que passou e o que não."""
    limite = asyncio.Semaphore(max(1, get_settings().mensageria_concorrencia))

    async def _um(p: PedidoEnvio):
        async with limite:
            try:
                return await enviar(p)
            except PedidoInvalido as exc:
                return exc

    return list(await asyncio.gather(*(_um(p) for p in pedidos)))


def canais_ativos() -> dict[str, str]:
    return {canal: escolhido(canal) for canal in ("whatsapp", "email", "sms")}
