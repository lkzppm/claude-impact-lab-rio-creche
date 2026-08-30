"""Resend — e-mail transacional.

Contrato levantado em 30/08/2026 na referência oficial
(https://resend.com/docs/api-reference/emails/send-email):

  POST https://api.resend.com/emails
  Authorization: Bearer re_...
  Header opcional: Idempotency-Key (até 256 caracteres; janela de 24 h)
  Body: {"from": "Nome <e@dominio>", "to": ["..."], "subject": "...", "html": "...", "text": "..."}
  → 200 {"id": "49a3999c-..."}
  → 4xx {"statusCode": 422, "name": "...", "message": "..."}

**Remetente de teste.** Sem domínio verificado, o `onboarding@resend.dev` só entrega no e-mail dono da
conta Resend. Para enviar a qualquer destinatário é preciso verificar um domínio e trocar `RESEND_FROM`.
No MVP isso basta: quem testa é dono da conta.
"""
from __future__ import annotations

import httpx

from app.config import get_settings
from app.provedores.base import NAO_CONFIGURADO, Mensagem, Resposta

API = "https://api.resend.com/emails"


class ProvedorResend:
    nome = "resend"
    canal = "email"

    @property
    def _s(self):
        return get_settings()

    @property
    def configurado(self) -> bool:
        return bool(self._s.resend_api_key)

    async def enviar(self, m: Mensagem) -> Resposta:
        s = self._s
        if not self.configurado:
            return Resposta("pendente", detalhe=f"{NAO_CONFIGURADO} (falta RESEND_API_KEY)")

        cabecalhos = {"Authorization": f"Bearer {s.resend_api_key}", "Content-Type": "application/json"}
        if m.chave_idem:
            cabecalhos["Idempotency-Key"] = m.chave_idem[:256]

        try:
            async with httpx.AsyncClient(timeout=s.mensageria_timeout_s) as cli:
                r = await cli.post(
                    API, headers=cabecalhos,
                    json={"from": s.resend_from, "to": [m.destino], "subject": m.assunto,
                          "html": m.html, "text": m.texto},
                )
        except httpx.TimeoutException:
            return Resposta("falha", detalhe="tempo esgotado ao chamar o Resend", permanente=False)
        except httpx.HTTPError as exc:
            return Resposta("falha", detalhe=f"erro de rede: {type(exc).__name__}", permanente=False)

        try:
            corpo = r.json()
        except ValueError:
            corpo = {}

        if r.is_success:
            return Resposta("enviado", corpo.get("id"), "aceito pelo Resend")

        mensagem = corpo.get("message") or r.text[:200]
        dica = ""
        if r.status_code == 403 and "resend.dev" in s.resend_from:
            dica = (" (o remetente de teste onboarding@resend.dev só entrega no e-mail dono da conta; "
                    "verifique um domínio e troque RESEND_FROM)")
        transitorio = r.status_code == 429 or r.status_code >= 500
        return Resposta("falha", detalhe=f"HTTP {r.status_code} — {mensagem}{dica}", permanente=not transitorio)
