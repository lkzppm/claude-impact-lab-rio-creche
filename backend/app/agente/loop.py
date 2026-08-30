"""Laço de tool use. Independente do SDK: recebe `chamar(params) -> resposta` (o objeto do SDK ou um falso
nos testes) e `executar(nome, argumentos) -> (texto_json, resumo, erro)`.

Fluxo: chama o modelo → se `stop_reason == "tool_use"`, executa cada bloco, devolve todos os `tool_result`
numa única mensagem de usuário e repete → senão, junta os blocos de texto. Depois de `max_ferramentas`
chamadas, a próxima requisição vai com `tool_choice = none` para o modelo fechar a resposta com o que tem.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable

TAMANHO_MAX_RESULTADO = 24_000   # caracteres de um tool_result; acima disso, corta e avisa o modelo


class ErroModelo(Exception):
    """Falha ao falar com o serviço do modelo. `status` vira o código HTTP da rota."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class ChamadaFerramenta:
    nome: str
    argumentos: dict[str, Any]
    resumo: str
    erro: str | None = None
    duracao_ms: int = 0


@dataclass
class Turno:
    resposta: str
    ferramentas: list[ChamadaFerramenta] = field(default_factory=list)
    modelo: str = ""
    tokens_entrada: int = 0
    tokens_saida: int = 0
    iteracoes: int = 0
    parada: str = "end_turn"


def serializar(dados: Any) -> str:
    texto = json.dumps(dados, ensure_ascii=False, default=str)
    if len(texto) > TAMANHO_MAX_RESULTADO:
        texto = texto[:TAMANHO_MAX_RESULTADO] + '… [resultado cortado: peça um recorte menor ou use os totais]'
    return texto


def _texto(resposta: Any) -> str:
    return "".join(getattr(b, "text", "") for b in resposta.content if getattr(b, "type", None) == "text").strip()


def conversar(
    chamar: Callable[[dict[str, Any]], Any],
    *,
    modelo: str,
    system: list[dict] | str,
    definicoes: list[dict[str, Any]],
    mensagens: list[dict[str, Any]],
    executar: Callable[[str, dict[str, Any]], tuple[Any, str, str | None]],
    max_ferramentas: int = 8,
    max_tokens: int = 8000,
    effort: str | None = "medium",
) -> Turno:
    msgs = list(mensagens)
    chamadas: list[ChamadaFerramenta] = []
    tin = tout = 0
    modelo_usado = modelo
    # cada iteração ou executa ≥1 ferramenta ou termina; +2 cobre a chamada final com tool_choice=none
    for iteracao in range(1, max_ferramentas + 3):
        params: dict[str, Any] = {
            "model": modelo, "max_tokens": max_tokens, "system": system, "messages": msgs,
            "thinking": {"type": "adaptive"},
        }
        if effort:
            params["output_config"] = {"effort": effort}
        if definicoes:
            params["tools"] = definicoes
            if len(chamadas) >= max_ferramentas:
                params["tool_choice"] = {"type": "none"}
        resposta = chamar(params)
        uso = getattr(resposta, "usage", None)
        tin += int(getattr(uso, "input_tokens", 0) or 0)
        tout += int(getattr(uso, "output_tokens", 0) or 0)
        modelo_usado = getattr(resposta, "model", None) or modelo_usado
        parada = getattr(resposta, "stop_reason", "end_turn")

        usos = [b for b in resposta.content if getattr(b, "type", None) == "tool_use"]
        if parada == "tool_use" and usos:
            msgs.append({"role": "assistant", "content": resposta.content})
            resultados = []
            for u in usos:
                args = dict(u.input or {})
                t0 = time.perf_counter()
                dados, resumo, erro = executar(u.name, args)
                chamadas.append(ChamadaFerramenta(nome=u.name, argumentos=args, resumo=resumo, erro=erro,
                                                  duracao_ms=int((time.perf_counter() - t0) * 1000)))
                resultados.append({"type": "tool_result", "tool_use_id": u.id, "content": serializar(dados),
                                   "is_error": bool(erro)})
            msgs.append({"role": "user", "content": resultados})   # todos os resultados numa só mensagem
            continue

        texto = _texto(resposta)
        if parada == "refusal":
            texto = texto or "Não posso ajudar com esse pedido. Se for uma dúvida sobre o painel, reformule a pergunta."
        elif parada == "max_tokens":
            texto = (texto + "\n\n(A resposta foi cortada por tamanho. Pergunte de forma mais específica.)").strip()
        elif not texto:
            texto = "Não consegui montar uma resposta. Tente perguntar de outro jeito."
        return Turno(resposta=texto, ferramentas=chamadas, modelo=modelo_usado, tokens_entrada=tin,
                     tokens_saida=tout, iteracoes=iteracao, parada=parada)
    raise ErroModelo(502, "o assistente não concluiu a resposta dentro do limite de consultas")
