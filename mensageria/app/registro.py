"""Log de envio — uma linha JSON por mensagem, **sem conteúdo e sem destino em claro**.

É o mesmo princípio do `consulta_agente` do backend (`spec/PRD.md`, seção 9): registra-se que houve
acesso, quem pediu e o que aconteceu, nunca o que foi dito. O que sai daqui:

    destino_id  impressão digital (sha256 truncado) — dá para contar quantas vezes a mesma família foi
                avisada, sem guardar o telefone
    destino     mascarado, para o operador reconhecer a linha sem ler o número inteiro
    referencia  correlação com a convocação, ex.: 'convocacao:1234'

O que **não** sai: assunto, texto, HTML, dados do template, credencial.
"""
from __future__ import annotations

import json
import logging
from typing import Any

log = logging.getLogger("mensageria.envio")

CAMPOS = ("id", "canal", "template", "destino", "destino_id", "provedor", "resultado",
          "protocolo", "detalhe", "repetido", "tentativas", "duracao_ms", "referencia", "ator")


def registrar(resultado: dict[str, Any], ator: str) -> None:
    linha = {c: resultado.get(c) for c in CAMPOS if c != "ator"}
    linha["ator"] = ator
    nivel = logging.WARNING if resultado.get("resultado") in ("falha", "pendente") else logging.INFO
    log.log(nivel, json.dumps(linha, ensure_ascii=False, default=str))
