from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Capacidade, Unidade
from app.schemas import UnidadeDetalhe, UnidadeOut

router = APIRouter(prefix="/unidades", tags=["unidades"])


@router.get("", response_model=list[UnidadeOut])
def listar(cre: str | None = None, q: str | None = None,
           limit: int = Query(200, ge=1, le=3000), db: Session = Depends(get_db)):
    stmt = select(Unidade)
    if cre:
        stmt = stmt.where(Unidade.cre == cre)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Unidade.nome.ilike(like), Unidade.codigo.ilike(like), Unidade.bairro.ilike(like)))
    return db.scalars(stmt.order_by(Unidade.nome).limit(limit)).all()


@router.get("/{codigo}", response_model=UnidadeDetalhe)
def detalhe(codigo: str, db: Session = Depends(get_db)):
    u = db.get(Unidade, codigo)
    if not u:
        raise HTTPException(404, "unidade não encontrada")
    caps = db.scalars(
        select(Capacidade).where(Capacidade.unidade_codigo == codigo)
        .order_by(Capacidade.ano.desc(), Capacidade.grupamento, Capacidade.horario)
    ).all()
    out = UnidadeDetalhe.model_validate(u)
    out.capacidade = caps
    return out
