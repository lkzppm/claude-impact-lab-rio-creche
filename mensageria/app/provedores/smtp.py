"""SMTP — alternativa ao Resend, sem cadastro em serviço novo.

Existe por um motivo prático: com uma conta Google e uma **senha de app** (a senha normal não serve
desde que o Google desligou o "acesso a apps menos seguros"), o canal de e-mail sobe em minutos, sem
esperar verificação de domínio nem aprovação de remetente:

    SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_TLS=true
    SMTP_USER=voce@gmail.com  SMTP_PASSWORD=<senha de app de 16 caracteres>

Em produção não é o caminho: relay institucional da Prefeitura ou serviço transacional com domínio
verificado entregam melhor e dão métrica de entrega. Aqui serve de rota de fuga do MVP.

`smtplib` é síncrono e bloqueia; a chamada roda em thread para não travar o event loop.
"""
from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr

from app.config import get_settings
from app.provedores.base import NAO_CONFIGURADO, Mensagem, Resposta


class ProvedorSMTP:
    nome = "smtp"
    canal = "email"

    @property
    def _s(self):
        return get_settings()

    @property
    def configurado(self) -> bool:
        s = self._s
        return bool(s.smtp_host and (s.smtp_from or s.smtp_user))

    async def enviar(self, m: Mensagem) -> Resposta:
        if not self.configurado:
            return Resposta("pendente", detalhe=f"{NAO_CONFIGURADO} (falta SMTP_HOST)")
        return await asyncio.to_thread(self._enviar_sincrono, m)

    def _enviar_sincrono(self, m: Mensagem) -> Resposta:
        s = self._s
        remetente = s.smtp_from or s.smtp_user or ""
        nome, endereco = parseaddr(remetente)
        if not endereco:
            return Resposta("falha", detalhe=f"remetente SMTP inválido: {remetente!r}")

        msg = EmailMessage()
        msg["From"] = formataddr((nome or "Inscrição Creche — SME-Rio", endereco))
        msg["To"] = m.destino
        msg["Subject"] = m.assunto
        msg["Message-ID"] = make_msgid(domain=endereco.partition("@")[2] or None)
        msg.set_content(m.texto)
        msg.add_alternative(m.html, subtype="html")

        try:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=s.mensageria_timeout_s) as servidor:
                if s.smtp_tls:
                    servidor.starttls()
                if s.smtp_user and s.smtp_password:
                    servidor.login(s.smtp_user, s.smtp_password)
                servidor.send_message(msg)
        except smtplib.SMTPAuthenticationError as exc:
            dica = ""
            if "gmail" in (s.smtp_host or ""):
                dica = " (no Gmail é preciso senha de app, com verificação em duas etapas ligada)"
            return Resposta("falha", detalhe=f"autenticação SMTP recusada: {exc.smtp_code}{dica}")
        except smtplib.SMTPRecipientsRefused:
            return Resposta("falha", detalhe="destinatário recusado pelo servidor SMTP")
        except (smtplib.SMTPException, OSError) as exc:
            return Resposta("falha", detalhe=f"erro SMTP: {type(exc).__name__}", permanente=False)

        # SMTP não devolve identificador; o Message-ID gerado é o que dá para rastrear.
        return Resposta("enviado", msg.get("Message-ID"), f"entregue ao relay {s.smtp_host}")
