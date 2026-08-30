"""Convocações: uma por alocação, com máquina de estados e log de eventos append-only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.db import get_db
from app.models import Alocacao, Convocacao, Evento, Inscricao, Rodada, Unidade
from app.schemas import (ConvocacaoDetalhe, ConvocacaoIrma, ConvocacaoOut, EventoIn, EventoOut, EventoRegistrado,
                         GerarConvocacoesIn, Pagina)

router = APIRouter(prefix="/convocacoes", tags=["convocacoes"])

# selecionada → contato_tentado (repete) → contato_confirmado → confirmada | recusada | expirada
# qualquer estado aberto → expirada. `liberada` só é atingido automaticamente: quando outra convocação
# da MESMA criança é confirmada, as demais abertas são liberadas (evento `liberada_por_confirmacao`).
TRANSICOES: dict[str, set[str]] = {
    "selecionada": {"contato_tentado", "contato_confirmado", "recusada", "expirada"},
    "contato_tentado": {"contato_tentado", "contato_confirmado", "recusada", "expirada"},
    "contato_confirmado": {"confirmada", "recusada", "expirada"},
    "confirmada": set(),
    "recusada": set(),
    "expirada": set(),
    "liberada": set(),
}
ABERTAS = ("selecionada", "contato_tentado", "contato_confirmado")
LIBERAM_VAGA = ("recusada", "expirada")
# vocabulário do frontend → status
TIPO_PARA_STATUS = {
    "tentativa_contato": "contato_tentado", "contato_tentado": "contato_tentado",
    "contato_confirmado": "contato_confirmado",
    "matricula_confirmada": "confirmada", "confirmada": "confirmada",
    "recusa": "recusada", "recusada": "recusada",
    "expiracao": "expirada", "expirada": "expirada",
}


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _enriquecer(c: Convocacao, extra: dict) -> ConvocacaoOut:
    out = ConvocacaoOut.model_validate(c)
    out.unidade_nome, out.cre, out.aluno_anon, out.pontuacao = (
        extra.get("nome"), extra.get("cre"), extra.get("aluno_anon"), extra.get("pontuacao"))
    out.n_tentativas = int(extra.get("n_tentativas") or 0)
    ref = c.atualizada_em if c.atualizada_em.tzinfo else c.atualizada_em.replace(tzinfo=timezone.utc)
    prazo = c.prazo_fim if c.prazo_fim is None or c.prazo_fim.tzinfo else c.prazo_fim.replace(tzinfo=timezone.utc)
    out.horas_no_status = round((_agora() - ref).total_seconds() / 3600, 1)
    out.atrasada = c.status in ABERTAS and prazo is not None and prazo < _agora()
    return out


@router.post("/gerar", response_model=dict, status_code=201)
def gerar(body: GerarConvocacoesIn, db: Session = Depends(get_db)):
    """Cria uma convocação (status `selecionada`) por vaga PRESA da rodada — até `vagas_presas` por criança."""
    if not db.get(Rodada, body.rodada_id):
        raise HTTPException(404, "rodada não encontrada")
    ja = set(db.scalars(select(Convocacao.alocacao_id).join(Alocacao).where(Alocacao.rodada_id == body.rodada_id)).all())
    alocs = db.scalars(select(Alocacao).where(Alocacao.rodada_id == body.rodada_id, Alocacao.status == "alocada",
                                              Alocacao.tipo == "presa")).all()
    agora = _agora()
    prazo = agora + timedelta(days=get_settings().prazo_convocacao_dias)
    n = 0
    for a in alocs:
        if a.id in ja:
            continue
        c = Convocacao(alocacao_id=a.id, inscricao_id=a.inscricao_id, unidade_codigo=a.unidade_codigo,
                       grupamento=a.grupamento, horario=a.horario, status="selecionada",
                       prazo_fim=prazo, criada_em=agora, atualizada_em=agora)
        db.add(c)
        db.flush()
        db.add(Evento(ocorrido_em=agora, tipo="selecionada", convocacao_id=c.id, inscricao_id=a.inscricao_id,
                      unidade_codigo=a.unidade_codigo, ator="sistema",
                      payload={"rodada_id": body.rodada_id, "prazo_fim": prazo.isoformat()}))
        n += 1
    db.commit()
    return {"rodada_id": body.rodada_id, "convocacoes_criadas": n, "ja_existentes": len(ja), "prazo_fim": prazo}


@router.get("", response_model=Pagina[ConvocacaoOut])
def listar(cre: str | None = None, unidade: str | None = None, status: str | None = None,
           atrasadas: bool | None = None, page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500),
           db: Session = Depends(get_db)):
    stmt = (
        select(Convocacao, Unidade.nome, Unidade.cre, Inscricao.aluno_anon, Inscricao.pontuacao)
        .join(Unidade, Unidade.codigo == Convocacao.unidade_codigo)
        .join(Inscricao, Inscricao.id == Convocacao.inscricao_id)
    )
    if cre:
        stmt = stmt.where(Unidade.cre == cre)
    if unidade:
        stmt = stmt.where(Convocacao.unidade_codigo == unidade)
    if status:
        stmt = stmt.where(Convocacao.status == status)
    if atrasadas is True:
        stmt = stmt.where(Convocacao.status.in_(ABERTAS), Convocacao.prazo_fim < _agora())
    elif atrasadas is False:
        stmt = stmt.where(~(Convocacao.status.in_(ABERTAS) & (Convocacao.prazo_fim < _agora())))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    linhas = db.execute(stmt.order_by(Convocacao.atualizada_em, Convocacao.id).offset((page - 1) * size).limit(size)).all()
    tent = dict(db.execute(
        select(Evento.convocacao_id, func.count()).where(
            Evento.convocacao_id.in_([c.id for c, *_ in linhas]), Evento.tipo == "contato_tentado")
        .group_by(Evento.convocacao_id)).all()) if linhas else {}
    items = [_enriquecer(c, {"nome": n, "cre": cr, "aluno_anon": al, "pontuacao": pt, "n_tentativas": tent.get(c.id, 0)})
             for c, n, cr, al, pt in linhas]
    return Pagina(items=items, total=total, page=page, size=size)


@router.get("/{convocacao_id}", response_model=ConvocacaoDetalhe)
def detalhe(convocacao_id: int, db: Session = Depends(get_db)):
    linha = db.execute(
        select(Convocacao, Unidade.nome, Unidade.cre, Inscricao.aluno_anon, Inscricao.pontuacao)
        .join(Unidade, Unidade.codigo == Convocacao.unidade_codigo)
        .join(Inscricao, Inscricao.id == Convocacao.inscricao_id)
        .where(Convocacao.id == convocacao_id)
        .options(selectinload(Convocacao.eventos))
    ).first()
    if not linha:
        raise HTTPException(404, "convocação não encontrada")
    c, n, cr, al, pt = linha
    n_tent = sum(1 for e in c.eventos if e.tipo == "contato_tentado")
    base = _enriquecer(c, {"nome": n, "cre": cr, "aluno_anon": al, "pontuacao": pt, "n_tentativas": n_tent})
    out = ConvocacaoDetalhe(**base.model_dump())
    out.eventos = [EventoOut.model_validate(e) for e in c.eventos]
    irmas = db.execute(
        select(Convocacao.id, Convocacao.unidade_codigo, Unidade.nome, Convocacao.status)
        .join(Unidade, Unidade.codigo == Convocacao.unidade_codigo)
        .where(Convocacao.inscricao_id == c.inscricao_id, Convocacao.id != c.id)
        .order_by(Convocacao.id)).all()
    out.irmas = [ConvocacaoIrma(id=i, unidade_codigo=u, unidade_nome=nm, status=st) for i, u, nm, st in irmas]
    return out


@router.post("/{convocacao_id}/eventos", response_model=EventoRegistrado, status_code=201)
def registrar_evento(convocacao_id: int, body: EventoIn, db: Session = Depends(get_db)):
    c = db.get(Convocacao, convocacao_id)
    if not c:
        raise HTTPException(404, "convocação não encontrada")
    novo = TIPO_PARA_STATUS[body.tipo]
    if novo not in TRANSICOES[c.status]:
        raise HTTPException(409, f"transição inválida: {c.status} → {novo}")
    agora = _agora()
    ev = Evento(ocorrido_em=agora, tipo=novo, convocacao_id=c.id, inscricao_id=c.inscricao_id,
                unidade_codigo=c.unidade_codigo, ator=body.ator or "polo", payload=body.payload)
    db.add(ev)
    if novo == "contato_confirmado" and c.status != "contato_confirmado":
        # o relógio de 3 dias começa a contar do contato confirmado, não do envio
        c.prazo_fim = agora + timedelta(days=get_settings().prazo_convocacao_dias)
    c.status = novo
    c.atualizada_em = agora
    if novo in LIBERAM_VAGA:
        a = db.get(Alocacao, c.alocacao_id)
        if a:
            a.vaga_liberada = True   # a vaga volta ao pool: próxima rodada `rematch` a redistribui
    if novo == "confirmada":
        # a criança confirmou UMA vaga: as outras que ela segurava são liberadas agora, não em 3 dias
        outras = db.scalars(select(Convocacao).where(
            Convocacao.inscricao_id == c.inscricao_id, Convocacao.id != c.id, Convocacao.status.in_(ABERTAS))).all()
        for o in outras:
            o.status = "liberada"
            o.atualizada_em = agora
            db.add(Evento(ocorrido_em=agora, tipo="liberada_por_confirmacao", convocacao_id=o.id,
                          inscricao_id=o.inscricao_id, unidade_codigo=o.unidade_codigo, ator="sistema",
                          payload={"confirmada_em_convocacao_id": c.id, "unidade_confirmada": c.unidade_codigo}))
            a = db.get(Alocacao, o.alocacao_id)
            if a:
                a.vaga_liberada = True
    db.commit()
    db.refresh(ev)
    det = detalhe(convocacao_id, db)
    return EventoRegistrado(status=det.status, evento=EventoOut.model_validate(ev), convocacao=det)
