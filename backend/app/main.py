"""API do baseline SME-Rio Inscrição Creche — motor de classificação por criança + painel de convocação."""
import asyncio
import contextlib
import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import chat, classificacao, convocacoes, familia, geo, health, inscricoes, painel, processos, unidades

log = logging.getLogger("creche")
settings = get_settings()


async def _rotina_expiracao(minutos: int) -> None:
    """Registra `expirada` (ator = sistema) nas convocações com prazo vencido, a cada `minutos`.
    Equivalente à compatibilização noturna do EOL de São Paulo; desligada por padrão (spec/04)."""
    from app.db import get_sessionmaker
    from app.routers.convocacoes import expirar_vencidas

    def _passo() -> int:
        db = get_sessionmaker()()
        try:
            n = len(expirar_vencidas(db, ator="sistema"))
            db.commit()
            return n
        finally:
            db.close()

    while True:
        await asyncio.sleep(minutos * 60)
        try:
            n = await asyncio.to_thread(_passo)
            if n:
                log.info("rotina de expiração: %s convocação(ões) expirada(s)", n)
        except Exception:  # noqa: BLE001 — a rotina nunca derruba a API
            log.exception("rotina de expiração falhou")


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    tarefa = None
    if settings.expiracao_automatica_minutos > 0:
        tarefa = asyncio.create_task(_rotina_expiracao(settings.expiracao_automatica_minutos))
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
    description="Motor determinístico de classificação por criança (Deferred Acceptance) e painel de "
                "convocação da CRE/polo com log de eventos append-only. Sem LLM no núcleo; o assistente "
                "(POST /chat) só lê o banco.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins_list, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")
for r in (health, processos, unidades, inscricoes, classificacao, convocacoes, painel, familia, chat, geo):
    api.include_router(r.router)
app.include_router(api)
