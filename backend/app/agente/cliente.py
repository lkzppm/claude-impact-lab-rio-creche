"""Cliente Anthropic (SDK oficial `anthropic`) e tradução dos erros do serviço para códigos HTTP.

`chamador()` devolve uma função `chamar(params) -> Message`; o laço (loop.py) não conhece o SDK — nos
testes entra um chamador falso. Sem ANTHROPIC_API_KEY, `AssistenteIndisponivel` (a rota responde 503).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Callable

from app.agente.loop import ErroModelo
from app.config import Settings, get_settings

BETA_FALLBACK = "server-side-fallback-2026-07-01"


class AssistenteIndisponivel(Exception):
    pass


@lru_cache
def _cliente(api_key: str, timeout_s: float):
    import anthropic  # importado aqui para a API subir mesmo sem o pacote configurado

    return anthropic.Anthropic(api_key=api_key, timeout=timeout_s, max_retries=1)


def chamador(settings: Settings | None = None) -> Callable[[dict[str, Any]], Any]:
    s = settings or get_settings()
    if not s.anthropic_api_key:
        raise AssistenteIndisponivel("assistente indisponível: configure ANTHROPIC_API_KEY no ambiente do backend")
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise AssistenteIndisponivel("assistente indisponível: pacote `anthropic` não instalado") from e
    client = _cliente(s.anthropic_api_key, s.chat_timeout_s)

    def chamar(params: dict[str, Any]) -> Any:
        try:
            if s.chat_fallbacks:
                # em caso de recusa por classificador, o serviço repete a chamada em outro modelo na mesma requisição
                return client.beta.messages.create(betas=[BETA_FALLBACK], fallbacks="default", **params)
            return client.messages.create(**params)
        except anthropic.AuthenticationError as e:
            raise ErroModelo(503, "assistente indisponível: ANTHROPIC_API_KEY inválida") from e
        except anthropic.PermissionDeniedError as e:
            raise ErroModelo(503, "assistente indisponível: a chave não tem permissão para este modelo") from e
        except anthropic.RateLimitError as e:
            raise ErroModelo(429, "o assistente está recebendo muitas perguntas agora; tente de novo em alguns segundos") from e
        except anthropic.APITimeoutError as e:
            raise ErroModelo(504, "o assistente demorou demais para responder; tente uma pergunta mais específica") from e
        except anthropic.APIConnectionError as e:
            raise ErroModelo(502, "sem conexão com o serviço do assistente") from e
        except anthropic.BadRequestError as e:
            raise ErroModelo(502, f"pedido rejeitado pelo serviço do assistente: {e.message}") from e
        except anthropic.APIStatusError as e:
            raise ErroModelo(502, f"erro do serviço do assistente ({e.status_code})") from e

    return chamar
