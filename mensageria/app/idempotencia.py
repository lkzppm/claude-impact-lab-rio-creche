"""Cache de idempotência: a mesma `chave_idem` em 24 h não reenvia.

Por que importa aqui: uma convocação repetida por retentativa do backend, por duplo clique do polo ou
por reprocessamento de fila vira **duas mensagens para a mesma família**. Em um processo em que a
mensagem diz "confirme até tal dia", duplicar é ruído que custa confiança.

Guarda o resultado, não a mensagem: nada de texto e nada de destino em claro (`spec/05`).

Limite conhecido: é memória do processo. Reiniciar o container ou rodar duas réplicas zera a garantia.
Para produção, Redis com a mesma interface — `obter`/`guardar` são as duas funções a reimplementar.
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any

_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
_trava = threading.Lock()


def obter(chave: str, ttl_s: int) -> dict[str, Any] | None:
    agora = time.monotonic()
    with _trava:
        item = _cache.get(chave)
        if item is None:
            return None
        gravado_em, valor = item
        if agora - gravado_em > ttl_s:
            _cache.pop(chave, None)
            return None
        _cache.move_to_end(chave)
        return valor


def guardar(chave: str, valor: dict[str, Any], maximo: int) -> None:
    with _trava:
        _cache[chave] = (time.monotonic(), valor)
        _cache.move_to_end(chave)
        while len(_cache) > maximo:
            _cache.popitem(last=False)


def limpar() -> None:
    with _trava:
        _cache.clear()


def tamanho() -> int:
    return len(_cache)
