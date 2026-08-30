from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.schemas import Health

router = APIRouter(tags=["health"])


@router.get("/health", response_model=Health)
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        estado = "ok"
    except Exception as exc:  # noqa: BLE001
        estado = f"erro: {type(exc).__name__}"
    return Health(status="ok" if estado == "ok" else "degradado", db=estado, versao=get_settings().versao)
