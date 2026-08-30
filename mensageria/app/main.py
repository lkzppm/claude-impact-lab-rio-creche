"""Serviço de mensageria da Inscrição Creche — WhatsApp, e-mail e SMS.

Container separado do backend por três razões:

1. **Credencial isolada.** Chave da Twilio e do Resend ficam neste processo. O backend, que fala com o
   banco e roda o motor, nunca as carrega.
2. **Falha isolada.** Provedor de mensagem fora do ar não derruba a classificação nem o painel: o
   backend recebe `resultado='falha'` e segue.
3. **Troca sem redeploy do backend.** Sandbox → WhatsApp Business, Resend → relay da Prefeitura: muda
   variável de ambiente aqui, nada muda lá.

O texto que chega à família mora em `app/templates.py`, não no backend. O backend manda
`template` + `dados`; o log guarda destino mascarado e resultado, nunca o conteúdo (LGPD art. 14).
"""
from __future__ import annotations

import contextlib
import logging

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import idempotencia, servico, templates
from app.config import get_settings
from app.provedores import panorama, validar
from app.schemas import LoteEnvio, LoteResultado, PedidoEnvio, PedidoRecusado, ResultadoEnvio, Saude

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("mensageria")
settings = get_settings()


def autorizar(authorization: str | None = Header(default=None)) -> None:
    """Token compartilhado com o backend. Sem `MENSAGERIA_TOKEN` definido, a API fica aberta —
    aceitável só porque, no compose, a porta é da rede interna."""
    esperado = get_settings().mensageria_token
    if not esperado:
        return
    if authorization != f"Bearer {esperado}":
        raise HTTPException(status_code=401, detail="token de mensageria ausente ou inválido")


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    validar()   # provedor inexistente em variável de ambiente derruba a subida, não uma mensagem
    for canal, info in panorama().items():
        log.info("canal %s → %s (%s)", canal, info.get("provedor"),
                 "pronto" if info.get("configurado") else "sem credencial: envios ficam pendentes")
    yield


app = FastAPI(
    title="Inscrição Creche — mensageria",
    version=settings.versao,
    description="Envio de WhatsApp, e-mail e SMS para o fluxo de convocação. O texto vem de um catálogo "
                "versionado; o log guarda destino mascarado e resultado, nunca o conteúdo.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins_list, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")


@api.get("/saude", response_model=Saude, tags=["saude"])
def saude() -> Saude:
    canais = panorama()
    pronto = any(c.get("configurado") for c in canais.values())
    return Saude(status="ok" if pronto else "degradado", versao=settings.versao,
                 canais=canais, templates=len(templates.TEMPLATES))


@api.get("/templates", tags=["templates"])
def catalogo() -> dict[str, object]:
    """O backend consulta daqui quais dados cada mensagem exige — evita descobrir em produção."""
    return {"templates": templates.catalogo()}


@api.post("/enviar", response_model=ResultadoEnvio, tags=["envio"],
          dependencies=[Depends(autorizar)])
async def enviar(pedido: PedidoEnvio) -> ResultadoEnvio:
    try:
        return await servico.enviar(pedido)
    except servico.PedidoInvalido as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api.post("/enviar-lote", response_model=LoteResultado, tags=["envio"],
          dependencies=[Depends(autorizar)])
async def enviar_lote(lote: LoteEnvio) -> LoteResultado:
    maximo = settings.mensageria_lote_max
    if len(lote.mensagens) > maximo:
        raise HTTPException(status_code=413, detail=f"lote de {len(lote.mensagens)} acima do teto de {maximo}")

    saidas = await servico.enviar_lote(lote.mensagens)
    mensagens, invalidos, contagem = [], [], {}
    for i, saida in enumerate(saidas):
        if isinstance(saida, servico.PedidoInvalido):
            # Pedido inválido não vira mensagem. Volta com a posição, para o chamador corrigir na origem.
            invalidos.append(PedidoRecusado(indice=i, erro=str(saida)))
            contagem["invalido"] = contagem.get("invalido", 0) + 1
            log.warning("lote: mensagem %s inválida — %s", i, saida)
            continue
        mensagens.append(saida)
        contagem[saida.resultado] = contagem.get(saida.resultado, 0) + 1
    return LoteResultado(total=len(lote.mensagens), por_resultado=contagem,
                         mensagens=mensagens, invalidos=invalidos)


@api.get("/idempotencia", tags=["saude"], dependencies=[Depends(autorizar)])
def estado_idempotencia() -> dict[str, int]:
    return {"chaves_em_memoria": idempotencia.tamanho(), "ttl_s": settings.mensageria_idem_ttl_s}


app.include_router(api)
