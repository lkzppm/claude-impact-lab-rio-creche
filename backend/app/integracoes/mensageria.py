"""Cliente do serviço de mensageria (`mensageria/`, container à parte).

O backend **não** envia mensagem: ele pede o envio. Quem fala com a Twilio e com o Resend é o outro
container, que carrega as credenciais e absorve a instabilidade do provedor.

Contrato (o serviço documenta em `/api/v1/templates` quais dados cada mensagem exige):

    enviar("whatsapp", "+5521999998888", "convocacao_vaga",
           {"crianca": "...", "unidade": "...", "grupamento": "...", "horario": "...", "prazo": "..."},
           referencia="convocacao:1234")

**Nunca levanta exceção.** Mensageria fora do ar não pode derrubar a convocação: a falha volta como
`{"resultado": "falha", "detalhe": ...}`, com o mesmo formato da resposta bem-sucedida, e quem chamou
decide se registra um evento, mostra "sem aviso" no painel ou tenta de novo depois.

Resultados possíveis (iguais aos do serviço):
    enviado   o provedor aceitou      simulado  provedor `mock`, nada saiu
    pendente  provedor sem credencial falha     recusado, indisponível ou pedido inválido

Sem dependência nova: `urllib` da biblioteca padrão, como em `conecta.py`.
"""
from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import urllib.error
import urllib.request
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("creche.mensageria")

# `contato.canal` (db/init/002_pre_cadastro.sql) → canal do serviço de mensageria.
CANAL_DO_CONTATO = {"whatsapp": "whatsapp", "email": "email", "celular": "sms"}


def _flag(nome: str, padrao: str) -> bool:
    return os.getenv(nome, padrao).strip().lower() not in ("0", "false", "nao", "não", "off", "")


@dataclass
class ConfigMensageria:
    url: str = field(default_factory=lambda: os.getenv("MENSAGERIA_URL", "http://localhost:8100/api/v1"))
    token: str | None = field(default_factory=lambda: os.getenv("MENSAGERIA_TOKEN") or None)
    timeout_s: float = field(default_factory=lambda: float(os.getenv("MENSAGERIA_TIMEOUT", "12")))
    # Desligar (`MENSAGERIA_ATIVO=0`) faz todo envio virar `pendente` sem chamada de rede: útil em
    # teste, carga da base e seed de demonstração, onde ninguém deve ser avisado de nada.
    ativo: bool = field(default_factory=lambda: _flag("MENSAGERIA_ATIVO", "1"))

    @property
    def base(self) -> str:
        return self.url.rstrip("/")


def _config() -> ConfigMensageria:
    return ConfigMensageria()


def _falha(detalhe: str, resultado: str = "falha") -> dict[str, Any]:
    return {"resultado": resultado, "detalhe": detalhe, "protocolo": None, "id": None}


def _chamar(metodo: str, caminho: str, corpo: dict | None = None) -> dict[str, Any]:
    cfg = _config()
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(f"{cfg.base}{caminho}", data=dados, method=metodo)
    req.add_header("Content-Type", "application/json")
    if cfg.token:
        req.add_header("Authorization", f"Bearer {cfg.token}")
    try:
        with urllib.request.urlopen(req, timeout=cfg.timeout_s) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        texto = exc.read().decode(errors="replace")[:300]
        with contextlib.suppress(ValueError, AttributeError):
            texto = json.loads(texto).get("detail", texto)
        log.warning("mensageria %s %s → HTTP %s: %s", metodo, caminho, exc.code, texto)
        return _falha(f"HTTP {exc.code} — {texto}")
    except urllib.error.URLError as exc:
        log.warning("mensageria indisponível em %s: %s", cfg.base, exc.reason)
        return _falha(f"serviço de mensageria indisponível: {exc.reason}")
    except (TimeoutError, OSError) as exc:
        log.warning("mensageria %s: %s", type(exc).__name__, exc)
        return _falha(f"falha de rede com a mensageria: {type(exc).__name__}")
    except ValueError as exc:
        return _falha(f"resposta inválida da mensageria: {exc}")


def enviar(canal: str, destino: str, template: str, dados: dict[str, Any] | None = None, *,
           referencia: str | None = None, chave_idem: str | None = None,
           ator: str = "sistema") -> dict[str, Any]:
    """Pede um envio. Devolve o resultado do serviço, ou um `falha`/`pendente` equivalente."""
    cfg = _config()
    if not cfg.ativo:
        return _falha("mensageria desligada (MENSAGERIA_ATIVO=0)", resultado="pendente")
    if canal not in ("whatsapp", "email", "sms"):
        return _falha(f"canal desconhecido: {canal!r}")
    return _chamar("POST", "/enviar", {
        "canal": canal, "destino": destino, "template": template, "dados": dados or {},
        "referencia": referencia, "chave_idem": chave_idem, "ator": ator,
    })


def enviar_lote(pedidos: list[dict[str, Any]]) -> dict[str, Any]:
    """Envia vários de uma vez — o serviço paraleliza com teto de concorrência.

    Cada item tem o formato do corpo de `enviar`. Preferir esta função a um laço de `enviar`:
    uma conexão em vez de N, e o serviço controla a taxa contra o provedor."""
    cfg = _config()
    if not cfg.ativo:
        return {"total": len(pedidos), "por_resultado": {"pendente": len(pedidos)},
                "mensagens": [], "invalidos": [],
                "detalhe": "mensageria desligada (MENSAGERIA_ATIVO=0)"}
    if not pedidos:
        return {"total": 0, "por_resultado": {}, "mensagens": [], "invalidos": []}
    return _chamar("POST", "/enviar-lote", {"mensagens": pedidos})


def enviar_para_contatos(contatos: Iterable[Any], template: str, dados: dict[str, Any] | None = None, *,
                         referencia: str | None = None, ator: str = "sistema",
                         apenas_principais: bool = False) -> list[dict[str, Any]]:
    """Avisa a família em todos os canais cadastrados.

    `contatos` são linhas de `contato` (ou qualquer objeto com `.canal` e `.valor`). A tabela guarda
    **mais de um contato em mais de um canal** de propósito (`spec/PRD.md`, seção 3): contato
    desatualizado é a causa nº 1 de vaga que vence sem ninguém atender. Avisar em todos os canais é o
    ponto da estrutura — por isso o padrão não filtra por `principal`.

    Com `referencia`, a chave de idempotência é derivada dela: reprocessar a mesma convocação não
    manda a mesma mensagem duas vezes para a mesma pessoa.
    """
    pedidos: list[dict[str, Any]] = []
    ignorados: list[dict[str, Any]] = []
    for c in contatos:
        if apenas_principais and not getattr(c, "principal", True):
            continue
        canal = CANAL_DO_CONTATO.get(getattr(c, "canal", ""))
        valor = getattr(c, "valor", None)
        if not canal or not valor:
            ignorados.append(_falha(f"contato sem canal utilizável: {getattr(c, 'canal', None)!r}",
                                    resultado="pendente"))
            continue
        pedido = {"canal": canal, "destino": valor, "template": template, "dados": dados or {},
                  "referencia": referencia, "ator": ator, "chave_idem": None}
        if referencia:
            digital = hashlib.sha256(f"{canal}:{valor}".encode()).hexdigest()[:16]
            pedido["chave_idem"] = f"{referencia}:{template}:{digital}"
        pedidos.append(pedido)

    if not pedidos:
        return ignorados
    lote = enviar_lote(pedidos)
    enviadas = lote.get("mensagens") or []
    # Lote que nem chegou ao serviço: devolve uma falha por pedido, para o chamador não achar que foi.
    if not enviadas and lote.get("resultado") == "falha":
        enviadas = [dict(lote, canal=p["canal"]) for p in pedidos]
    return [*enviadas, *ignorados]


def saude() -> dict[str, Any]:
    return _chamar("GET", "/saude")


def catalogo() -> dict[str, Any]:
    return _chamar("GET", "/templates")
