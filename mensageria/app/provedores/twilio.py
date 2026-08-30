"""Twilio — WhatsApp (sandbox ou número aprovado) e SMS.

Contrato levantado em 30/08/2026 na referência oficial
(https://www.twilio.com/docs/messaging/api/message-resource):

  POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
  Auth: HTTP Basic (AccountSid, AuthToken)
  Body (form-encoded): To, From, Body
  → 201 {"sid": "SM...", "status": "queued|accepted", "error_code": null, "error_message": null}
  → 4xx {"code": 21211, "message": "...", "more_info": "...", "status": 400}

Endereço de WhatsApp: `whatsapp:+55DDDNNNNNNNNN` nos dois lados (To e From).

**Body ou ContentSid.** O WhatsApp só aceita texto livre (`Body`) dentro da janela de 24 h aberta por uma
mensagem do destinatário. Fora dela, o envio exige um **template aprovado** — na API, `ContentSid` +
`ContentVariables`, com os campos posicionais `{{1}}`, `{{2}}`… do template.

**Em conta trial, `Body` nunca funciona.** Mesmo com a janela aberta, a Twilio responde
`400 [21654] ContentSid Required`: a trial só envia por um dos Content Templates que ela mesma provisiona
(verificado em 30/08/2026 nesta conta, com o `join` confirmado 69 s antes do envio). Os `HX...` desses
templates aparecem só no console — a Content API que os listaria responde `401 [20003] not available on a
Trial account`. Daí o mapa em `TWILIO_CONTENT_SIDS`: os SIDs são da conta, não do código.

E esses templates da trial têm **texto fixo, sem placeholder** ("Reminder: Appt Tue Oct 29, 3:00 PM…"), então
`ContentVariables` é ignorado: servem para provar o canal, não para entregar o texto da convocação. Outras
restrições da trial: destinatário entre os **até 5 números verificados** e franquia de **100 mensagens**.

**Produção.** Número WhatsApp Business aprovado, templates próprios aprovados pela Meta e o mesmo
`TWILIO_CONTENT_SIDS` apontando para eles. Dentro da janela de 24 h, sem mapa, volta a valer o `Body` —
e é por isso que os dois caminhos convivem aqui.

**SMS.** Mesmo endpoint, sem o prefixo `whatsapp:`, mas exige número comprado (`TWILIO_SMS_FROM`). O
sandbox é só WhatsApp — sem esse número o canal SMS fica `pendente`.

`enviado` aqui significa **aceito pela Twilio** (`queued`/`accepted`), não entregue no aparelho. A entrega
confirmada exige `StatusCallback` com webhook, que esta fase não tem.
"""
from __future__ import annotations

import json
import logging

import httpx

from app.config import get_settings
from app.provedores.base import NAO_CONFIGURADO, Mensagem, Resposta

log = logging.getLogger("mensageria.twilio")

API = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
LIMITE_CORPO = 1600                      # limite do campo Body na API da Twilio

# Só os códigos de que temos certeza pela documentação; qualquer outro sai com a mensagem da Twilio.
DICAS = {
    21211: "número de destino inválido para a Twilio",
    21610: "o destinatário respondeu STOP e está descadastrado",
    21608: "conta trial: o número de destino precisa ser verificado no console da Twilio",
    63016: "fora da janela de 24 h do WhatsApp — o destinatário precisa mandar 'join <código>' "
           "para o número do sandbox, ou o envio precisa usar template aprovado pela Meta",
}
# Transitórios: repetir adianta.
TRANSITORIOS = {20429, 20503, 30001}


class ProvedorTwilio:
    def __init__(self, canal: str) -> None:
        if canal not in ("whatsapp", "sms"):
            raise ValueError(f"Twilio não atende o canal {canal!r}")
        self.canal = canal
        self.nome = f"twilio_{canal}"

    @property
    def _s(self):
        return get_settings()

    @property
    def _remetente(self) -> str | None:
        s = self._s
        return s.twilio_whatsapp_from if self.canal == "whatsapp" else s.twilio_sms_from

    @property
    def configurado(self) -> bool:
        s = self._s
        return bool(s.twilio_account_sid and s.twilio_auth_token and self._remetente)

    def _endereco(self, valor: str) -> str:
        return f"whatsapp:{valor}" if self.canal == "whatsapp" else valor

    async def enviar(self, m: Mensagem) -> Resposta:
        if not self.configurado:
            falta = "TWILIO_SMS_FROM" if self.canal == "sms" else "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN"
            return Resposta("pendente", detalhe=f"{NAO_CONFIGURADO} (falta {falta})")

        s = self._s
        remetente = self._remetente
        dados = {"To": self._endereco(m.destino),
                 "From": self._endereco(remetente.removeprefix("whatsapp:"))}
        conteudo = _content_template(m.template, m.dados) if self.canal == "whatsapp" else None
        if conteudo:
            dados["ContentSid"] = conteudo["sid"]
            if conteudo["variaveis"]:
                dados["ContentVariables"] = json.dumps(conteudo["variaveis"], ensure_ascii=False)
        else:
            dados["Body"] = m.texto if len(m.texto) <= LIMITE_CORPO else m.texto[: LIMITE_CORPO - 1] + "…"

        try:
            async with httpx.AsyncClient(timeout=s.mensageria_timeout_s) as cli:
                r = await cli.post(
                    API.format(sid=s.twilio_account_sid),
                    data=dados,
                    auth=(s.twilio_account_sid, s.twilio_auth_token),
                )
        except httpx.TimeoutException:
            return Resposta("falha", detalhe="tempo esgotado ao chamar a Twilio", permanente=False)
        except httpx.HTTPError as exc:
            return Resposta("falha", detalhe=f"erro de rede: {type(exc).__name__}", permanente=False)

        try:
            corpo_json = r.json()
        except ValueError:
            corpo_json = {}

        if r.is_success:
            erro = corpo_json.get("error_code")
            if erro:                       # a Twilio aceitou o pedido mas já marcou falha na mensagem
                return Resposta("falha", corpo_json.get("sid"), _detalhe(erro, corpo_json.get("error_message")),
                                permanente=erro not in TRANSITORIOS)
            return Resposta("enviado", corpo_json.get("sid"),
                            f"twilio status={corpo_json.get('status', '?')}")

        codigo = corpo_json.get("code")
        detalhe = _detalhe(codigo, corpo_json.get("message") or r.text[:200])
        transitorio = r.status_code == 429 or r.status_code >= 500 or codigo in TRANSITORIOS
        return Resposta("falha", detalhe=f"HTTP {r.status_code} — {detalhe}", permanente=not transitorio)


def _content_template(nome: str, dados: dict[str, object]) -> dict | None:
    """Traduz um template do nosso catálogo para o Content Template da conta Twilio.

    Devolve `{"sid": "HX...", "variaveis": {"1": "...", "2": "..."}}` ou `None` quando não há mapa —
    aí o envio segue com texto livre, que é o caminho normal dentro da janela de 24 h.

    Mapa mal formado nunca derruba o envio: registra e cai para texto livre. Um JSON com vírgula a mais
    não pode significar convocação não enviada.
    """
    bruto = get_settings().twilio_content_sids
    if not bruto or not nome:
        return None
    try:
        mapa = json.loads(bruto)
        item = mapa.get(nome)
        if not item:
            return None
        sid = item["sid"]
        moldes = item.get("variaveis") or []
        valores = {str(i): str(molde).format_map(_Faltando(dados)) for i, molde in enumerate(moldes, 1)}
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        log.warning("TWILIO_CONTENT_SIDS inválido para %r (%s) — enviando texto livre", nome, exc)
        return None
    return {"sid": sid, "variaveis": valores}


class _Faltando(dict):
    """Variável ausente vira string vazia em vez de estourar: o Content Template já foi aprovado com
    aquele número de campos, e faltar um valor não pode impedir a mensagem de sair."""

    def __missing__(self, chave):
        return ""


def _detalhe(codigo: int | None, mensagem: str | None) -> str:
    dica = DICAS.get(codigo)
    partes = [p for p in (f"[{codigo}]" if codigo else None, mensagem, f"({dica})" if dica else None) if p]
    return " ".join(partes) if partes else "sem detalhe da Twilio"
