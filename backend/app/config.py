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

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
