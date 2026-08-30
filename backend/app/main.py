"""API do baseline SME-Rio Inscrição Creche — motor de classificação por criança + painel de convocação."""
import asyncio
import contextlib
import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (chat, classificacao, convocacoes, familia, geo, health, inscricoes, mensagens, motor,
                         painel, processos, unidades)

log = logging.getLogger("creche")
settings = get_settings()


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    """Sobe o motor contínuo (app/motor.py): classificação, convocação e cascata de vagas liberadas rodando
    sozinhas a cada `MOTOR_INTERVALO_SEGUNDOS`. 0 desliga a rotina — o ciclo continua disponível em
    POST /motor/ciclo."""
    from app import motor as motor_core

    tarefa = asyncio.create_task(motor_core.rodar()) if settings.motor_intervalo_segundos > 0 else None
    try:
        yield
    finally:
        if tarefa:
            tarefa.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await tarefa


app = FastAPI(
    title="Inscrição Creche — baseline",
    version=settings.versao,
    description="Motor determinístico de classificação por criança (Deferred Acceptance) rodando 24/7 e "
                "painel de convocação da CRE/polo com log de eventos append-only. Sem LLM no núcleo; o "
                "assistente (POST /chat) só lê o banco.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins_list, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")
for r in (health, processos, unidades, inscricoes, classificacao, convocacoes, painel, familia, chat, geo,
          mensagens, motor):
    api.include_router(r.router)
app.include_router(api)
