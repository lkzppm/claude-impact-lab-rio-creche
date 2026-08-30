"""Configuração por variáveis de ambiente (.env na raiz do repo ou do backend)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_BACKEND_DIR.parent / ".env", _BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://creche:creche@localhost:5432/creche"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost"
    data_dir: Path = _BACKEND_DIR.parent / "data"
    out_dir: Path = _BACKEND_DIR.parent / "out"
    versao: str = "0.1.0"
    # Prazo da família após a convocação (Res. SME 542/2025: 3 dias úteis; aqui 3 dias corridos)
    prazo_convocacao_dias: int = 3
    # Rotina que registra `expirada` (ator = sistema) nas convocações com prazo vencido. 0 = desligada:
    # na demonstração a expiração fica visível como "vencidas" e o polo registra em lote pelo painel.
    expiracao_automatica_minutos: int = 0

    # Assistente (chat com tools, app/agente). Sem ANTHROPIC_API_KEY, POST /chat responde 503.
    anthropic_api_key: str | None = None
    chat_model: str = "claude-opus-5"
    chat_max_tools: int = 8            # chamadas de ferramenta por turno
    chat_max_tokens: int = 8000
    chat_effort: str = "medium"        # low | medium | high | xhigh | max
    chat_timeout_s: float = 90.0
    chat_fallbacks: bool = True        # em caso de recusa, o serviço repete a chamada em outro modelo (beta)
    chat_max_historico: int = 30       # mensagens do histórico enviadas ao modelo
    chat_sql_timeout_ms: int = 5000    # statement_timeout da consulta_sql (só no Nível Central)
    chat_sql_max_linhas: int = 200

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
