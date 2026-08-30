"""API do baseline SME-Rio Inscrição Creche — motor de classificação por criança + painel de convocação."""
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import classificacao, convocacoes, familia, geo, health, inscricoes, painel, processos, unidades

settings = get_settings()
app = FastAPI(
    title="Inscrição Creche — baseline",
    version=settings.versao,
    description="Motor determinístico de classificação por criança (Deferred Acceptance) e painel de "
                "convocação da CRE/polo com log de eventos append-only. Sem LLM no núcleo.",
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins_list, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")
for r in (health, processos, unidades, inscricoes, classificacao, convocacoes, painel, familia, geo):
    api.include_router(r.router)
app.include_router(api)
