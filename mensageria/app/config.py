"""Configuração por variáveis de ambiente (.env na raiz do repo ou do serviço)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_SERVICO_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_SERVICO_DIR.parent / ".env", _SERVICO_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    versao: str = "0.1.0"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost"

    # Token compartilhado com o backend. Vazio = aberto (só para desenvolvimento local).
    mensageria_token: str | None = None

    # Provedor por canal. `mock` não envia nada — registra e devolve `simulado`.
    mensageria_whatsapp: str = "mock"        # mock | twilio
    mensageria_email: str = "mock"           # mock | resend | smtp
    mensageria_sms: str = "mock"             # mock | twilio

    # Envio
    mensageria_timeout_s: float = 15.0
    mensageria_tentativas: int = 3           # 1 tentativa + 2 repetições, só para erro transitório
    mensageria_backoff_s: float = 0.8
    mensageria_lote_max: int = 500
    mensageria_concorrencia: int = 5         # envios simultâneos no lote
    mensageria_idem_ttl_s: int = 86_400      # 24 h, igual à janela de idempotência do Resend
    mensageria_idem_max: int = 20_000

    # Twilio (WhatsApp sandbox e SMS)
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    # Número do sandbox — **varia por conta**, confira no console (Messaging → Try it out). Sem o valor
    # certo aqui, a Twilio recusa o envio.
    twilio_whatsapp_from: str = "whatsapp:+14155238886"
    # Mapa `template do catálogo → Content Template da Twilio`, em JSON. Necessário porque o WhatsApp só
    # aceita texto livre dentro da janela de 24 h — e em conta trial, nem isso: todo envio exige
    # `ContentSid` de um template que a Twilio provisiona (os SIDs saem do console, são da conta).
    #   {"convocacao_vaga": {"sid": "HX...", "variaveis": ["{crianca}", "{unidade}", "{prazo}"]}}
    # Cada item de `variaveis` é um molde preenchido com os `dados` do pedido, na ordem dos {{1}}, {{2}}…
    # Sem mapa para um template, o provedor manda texto livre (o caminho normal dentro da janela).
    twilio_content_sids: str | None = None
    twilio_sms_from: str | None = None                    # exige número comprado; sem ele, SMS fica `pendente`

    # Resend (e-mail)
    resend_api_key: str | None = None
    resend_from: str = "Inscricao Creche <onboarding@resend.dev>"

    # SMTP (alternativa ao Resend: Gmail com senha de app, por exemplo)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_tls: bool = True
    smtp_from: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
