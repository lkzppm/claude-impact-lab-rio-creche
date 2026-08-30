"""Estado do motor contínuo e execução manual de um ciclo (app/motor.py)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Convocacao, Evento, Rodada
from app.schemas import MotorCiclo, MotorEstado, RodadaOut

router = APIRouter(prefix="/motor", tags=["motor"])


def _pendentes(db: Session) -> int:
    """Vagas liberadas (recusa, prazo vencido, confirmação em outra unidade) ainda sem repasse."""
    from app.routers.convocacoes import VAGA_LIBERADA

    repassadas = {int(p["origem_convocacao_id"])
                  for p in db.scalars(select(Evento.payload).where(Evento.tipo == "selecionada_da_lista")).all()
                  if isinstance(p, dict) and p.get("origem_convocacao_id") is not None}
    ids = db.scalars(select(Convocacao.id).where(Convocacao.status.in_(VAGA_LIBERADA))).all()
    return sum(1 for i in ids if i not in repassadas)


def _estado(db: Session) -> MotorEstado:
    from app.motor import ESTADO

    ultima = db.scalars(select(Rodada).order_by(Rodada.id.desc()).limit(1)).first()
    return MotorEstado(
        ligado=ESTADO.ligado, intervalo_s=ESTADO.intervalo_s, expira_vencidas=ESTADO.expira_vencidas,
        executando=ESTADO.executando, iniciado_em=ESTADO.iniciado_em, ultima_execucao=ESTADO.ultima_execucao,
        proxima_execucao=ESTADO.proxima_execucao, ciclos=ESTADO.ciclos, total_rodadas=ESTADO.total_rodadas,
        total_convocacoes=ESTADO.total_convocacoes, total_expiradas=ESTADO.total_expiradas,
        total_repassadas=ESTADO.total_repassadas, ultimo_erro=ESTADO.ultimo_erro,
        ultimo_ciclo=MotorCiclo(**ESTADO.ultimo_ciclo.dict()) if ESTADO.ultimo_ciclo else None,
        rodada_vigente=RodadaOut.model_validate(ultima) if ultima else None,
        vagas_liberadas_pendentes=_pendentes(db),
    )


@router.get("", response_model=MotorEstado)
def estado(db: Session = Depends(get_db)):
    """O motor está rodando? O que ele fez no último ciclo e quando roda de novo."""
    return _estado(db)


@router.post("/ciclo", response_model=MotorEstado, status_code=201)
def ciclo(db: Session = Depends(get_db)):
    """Força um ciclo agora, sem esperar o intervalo. Mesma função da rotina de fundo."""
    from app.motor import ciclo_com_sessao

    ciclo_com_sessao()
    db.expire_all()
    return _estado(db)


@router.get("/eventos", response_model=list[dict])
def eventos(limit: int = 20, db: Session = Depends(get_db)):
    """Últimos ciclos que mudaram alguma coisa — o que o motor fez, na ordem do log append-only."""
    linhas = db.scalars(select(Evento).where(Evento.tipo == "motor_ciclo")
                        .order_by(Evento.ocorrido_em.desc()).limit(max(1, min(limit, 100)))).all()
    return [{"em": e.ocorrido_em, **(e.payload or {})} for e in linhas]
