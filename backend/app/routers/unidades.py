from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Alocacao, Capacidade, Convocacao, Evento, Inscricao, Unidade
from app.schemas import CapacidadeIn, CapacidadeOut, FilaUnidade, FilaUnidadeItem, UnidadeDetalhe, UnidadeOut

router = APIRouter(prefix="/unidades", tags=["unidades"])

ABERTAS = ("selecionada", "contato_tentado", "contato_confirmado")


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


@router.put("/{codigo}/capacidade", response_model=CapacidadeOut)
def informar_capacidade(codigo: str, body: CapacidadeIn, db: Session = Depends(get_db)):
    """A unidade/polo informa as vagas reais: `fonte = informada` (PRD §9). Fica no log de eventos com ator."""
    if not db.get(Unidade, codigo):
        raise HTTPException(404, "unidade não encontrada")
    grup, hor = body.grupamento.strip(), body.horario.strip()
    cap = db.get(Capacidade, (body.ano, codigo, grup, hor))
    de, fonte_anterior = (cap.vagas, cap.fonte) if cap else (None, None)
    if cap:
        cap.vagas, cap.fonte = body.vagas, "informada"
    else:
        cap = Capacidade(ano=body.ano, unidade_codigo=codigo, grupamento=grup, horario=hor, vagas=body.vagas, fonte="informada")
        db.add(cap)
    db.add(Evento(ocorrido_em=datetime.now(timezone.utc), tipo="capacidade_informada", unidade_codigo=codigo,
                  ator=body.ator or "polo",
                  payload={"ano": body.ano, "grupamento": grup, "horario": hor, "de": de, "para": body.vagas,
                           "fonte_anterior": fonte_anterior}))
    db.commit()
    db.refresh(cap)
    return cap


@router.get("/{codigo}/fila", response_model=FilaUnidade)
def fila(codigo: str, grupamento: str | None = None, horario: str | None = None, rodada_id: int | None = None,
         limit: int = Query(200, ge=1, le=2000), db: Session = Depends(get_db)):
    """Lista de espera da unidade na última rodada que a classificou: quem é o próximo, na ordem do motor."""
    if not db.get(Unidade, codigo):
        raise HTTPException(404, "unidade não encontrada")
    rodada_id = rodada_id or db.scalar(select(func.max(Alocacao.rodada_id)).where(Alocacao.unidade_codigo == codigo))
    if rodada_id is None:
        return FilaUnidade(unidade_codigo=codigo, rodada_id=None, grupamento=grupamento, horario=horario)
    grupos = db.execute(
        select(Alocacao.grupamento, Alocacao.horario,
               func.count().filter(Alocacao.status == "lista_espera"),
               func.count().filter(Alocacao.tipo == "presa"))
        .where(Alocacao.rodada_id == rodada_id, Alocacao.unidade_codigo == codigo)
        .group_by(Alocacao.grupamento, Alocacao.horario).order_by(Alocacao.grupamento, Alocacao.horario)
    ).all()
    lista_grupos = [{"grupamento": g, "horario": h, "n_fila": int(nf), "n_reservadas": int(nr)} for g, h, nf, nr in grupos]
    if not grupos:
        return FilaUnidade(unidade_codigo=codigo, rodada_id=rodada_id, grupamento=grupamento, horario=horario)
    if not grupamento or not horario:
        grupamento, horario = grupos[0][0], grupos[0][1]

    base = (select(Alocacao).where(Alocacao.rodada_id == rodada_id, Alocacao.unidade_codigo == codigo,
                                   Alocacao.grupamento == grupamento, Alocacao.horario == horario))
    n_fila = db.scalar(select(func.count()).select_from(base.where(Alocacao.status == "lista_espera").subquery())) or 0
    n_res = db.scalar(select(func.count()).select_from(base.where(Alocacao.tipo == "presa").subquery())) or 0
    n_conv = db.scalar(select(func.count()).where(Convocacao.unidade_codigo == codigo, Convocacao.grupamento == grupamento,
                                                  Convocacao.horario == horario, Convocacao.status.in_(ABERTAS))) or 0
    linhas = db.execute(
        select(Alocacao, Inscricao.aluno_anon).join(Inscricao, Inscricao.id == Alocacao.inscricao_id)
        .where(Alocacao.rodada_id == rodada_id, Alocacao.unidade_codigo == codigo, Alocacao.grupamento == grupamento,
               Alocacao.horario == horario, Alocacao.status == "lista_espera")
        .order_by(Alocacao.posicao_fila, Alocacao.id).limit(limit)
    ).all()
    ids = [a.inscricao_id for a, _ in linhas]
    convs: dict[int, list[Convocacao]] = {i: [] for i in ids}
    if ids:
        for c in db.scalars(select(Convocacao).where(Convocacao.inscricao_id.in_(ids))).all():
            convs[c.inscricao_id].append(c)
    itens = []
    for a, aluno in linhas:
        cs = convs[a.inscricao_id]
        abertas = sum(1 for c in cs if c.status in ABERTAS)
        if any(c.status == "confirmada" for c in cs):
            sit = "confirmada_em_outra"
        elif any(c.unidade_codigo == codigo and c.status in ABERTAS for c in cs):
            sit = "convocada_aqui"
        elif abertas >= 3:
            sit = "reservas_cheias"
        else:
            sit = "aguardando"
        itens.append(FilaUnidadeItem(alocacao_id=a.id, inscricao_id=a.inscricao_id, aluno_anon=aluno, pontuacao=a.pontuacao,
                                     posicao_fila=a.posicao_fila, ordem=((a.motivo or {}).get("final") or {}).get("ordem"),
                                     situacao=sit, reservas_abertas=abertas))
    return FilaUnidade(unidade_codigo=codigo, rodada_id=rodada_id, grupamento=grupamento, horario=horario,
                       grupos=lista_grupos, n_fila=int(n_fila), n_reservadas=int(n_res), n_convocadas_abertas=int(n_conv),
                       itens=itens)
