from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Inscricao, Pergunta, Processo
from app.schemas import PerguntaOut, ProcessoOut

router = APIRouter(prefix="/processos", tags=["processos"])


@router.get("", response_model=list[ProcessoOut])
def listar(db: Session = Depends(get_db)):
    n_insc = dict(db.execute(select(Inscricao.ano, func.count()).group_by(Inscricao.ano)).all())
    regua = db.execute(
        select(Pergunta.ano, func.count(), func.sum(Pergunta.pontuacao)).group_by(Pergunta.ano)
    ).all()
    n_perg = {a: n for a, n, _ in regua}
    pmax = {a: int(s or 0) for a, _, s in regua}
    return [
        ProcessoOut(ano=p.ano, prm_id=p.prm_id, descricao=p.descricao,
                    n_inscricoes=n_insc.get(p.ano, 0), n_perguntas=n_perg.get(p.ano, 0),
                    pontuacao_maxima=pmax.get(p.ano, 0))
        for p in db.scalars(select(Processo).order_by(Processo.ano)).all()
    ]


@router.get("/{ano}/regua", response_model=list[PerguntaOut])
def regua(ano: int, db: Session = Depends(get_db)):
    itens = db.scalars(select(Pergunta).where(Pergunta.ano == ano).order_by(Pergunta.ordem, Pergunta.ich_perg_id)).all()
    if not itens:
        raise HTTPException(404, f"processo {ano} não encontrado")
    return itens
