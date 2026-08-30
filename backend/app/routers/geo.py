"""Geocodificação de CEP para o pré-cadastro (APIs públicas + centroide de bairro da própria base)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import geo
from app.db import get_db
from app.models import Unidade
from app.schemas import GeoEndereco

router = APIRouter(prefix="/geo", tags=["geo"])


def centroide_bairro_factory(db: Session):
    def centroide(bairro: str):
        r = db.execute(select(func.avg(Unidade.lat), func.avg(Unidade.lon))
                       .where(func.lower(func.unaccent(Unidade.bairro)) == func.lower(func.unaccent(bairro)),
                              Unidade.lat.isnot(None))).one() if _tem_unaccent(db) else \
            db.execute(select(func.avg(Unidade.lat), func.avg(Unidade.lon))
                       .where(func.lower(Unidade.bairro) == bairro.lower(), Unidade.lat.isnot(None))).one()
        return (float(r[0]), float(r[1])) if r and r[0] is not None else None
    return centroide


def _tem_unaccent(db: Session) -> bool:
    try:
        db.execute(select(func.unaccent("a")))
        return True
    except Exception:  # noqa: BLE001
        db.rollback()
        return False


@router.get("/cep/{cep}", response_model=GeoEndereco)
def cep(cep: str, db: Session = Depends(get_db)):
    if not geo.normalizar_cep(cep):
        raise HTTPException(404, "CEP inválido: use 8 dígitos.")
    e = geo.geocodificar(cep, centroide_bairro_factory(db))
    return GeoEndereco(**e.dict())
