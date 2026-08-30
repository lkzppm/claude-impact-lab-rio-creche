"""Convocações: uma por vaga presa, com máquina de estados e log de eventos append-only.

As funções `_criar_convocacao`, `_registrar_selecao` e `_aplicar_transicao` são a única implementação das
regras; a API, a visão da família, a rotina de expiração e o seed de demonstração passam todas por elas.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.db import get_db
from app.models import Alocacao, Convocacao, Evento, Inscricao, Rodada, Unidade
from app.schemas import (
    ConvocacaoDetalhe,
    ConvocacaoIrma,
    ConvocacaoOut,
    ConvocarProximoIn,
    EventoIn,
    EventoOut,
    EventoRegistrado,
    ExpirarVencidasIn,
    ExpirarVencidasOut,
    GerarConvocacoesIn,
    Pagina,
    ProximoDaFila,
)

router = APIRouter(prefix="/convocacoes", tags=["convocacoes"])

# selecionada → contato_tentado (repete) → contato_confirmado → confirmada | recusada | expirada
# qualquer estado aberto → expirada. `liberada` só é atingido automaticamente: quando outra convocação
# da MESMA criança é confirmada, as demais abertas são liberadas (evento `liberada_por_confirmacao`).
TRANSICOES: dict[str, set[str]] = {
    "selecionada": {"contato_tentado", "contato_confirmado", "confirmada", "recusada", "expirada"},
    "contato_tentado": {"contato_tentado", "contato_confirmado", "confirmada", "recusada", "expirada"},
    "contato_confirmado": {"confirmada", "recusada", "expirada"},
    "confirmada": set(),
    "recusada": set(),
    "expirada": set(),
    "liberada": set(),
}
ABERTAS = ("selecionada", "contato_tentado", "contato_confirmado")
ENCERRADAS = ("confirmada", "recusada", "expirada", "liberada")
LIBERAM_VAGA = ("recusada", "expirada")
VAGA_LIBERADA = ("recusada", "expirada", "liberada")     # estados em que a vaga voltou ao pool
SEM_AVISO = ("selecionada", "contato_tentado")           # a família ainda não foi avisada
# vocabulário do frontend → status
TIPO_PARA_STATUS = {
    "tentativa_contato": "contato_tentado", "contato_tentado": "contato_tentado",
    "contato_confirmado": "contato_confirmado",
    "matricula_confirmada": "confirmada", "confirmada": "confirmada",
    "recusa": "recusada", "recusada": "recusada",
    "expiracao": "expirada", "expirada": "expirada",
}
FILAS = ("vencidas", "vencem_24h", "sem_aviso", "aguardando", "abertas", "trabalho", "encerradas")


def _agora() -> datetime:
    return datetime.now(UTC)


def _tz(dt: datetime | None) -> datetime | None:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=UTC)


def _prazo(a_partir_de: datetime) -> datetime:
    return a_partir_de + timedelta(days=get_settings().prazo_convocacao_dias)


def _proxima_acao(status: str, prazo_fim: datetime | None, agora: datetime) -> str | None:
    """Uma frase para o servidor do polo. Deriva de status + prazo; não é persistida."""
    if status not in ABERTAS:
        return None
    prazo = _tz(prazo_fim)
    if prazo is not None and prazo < agora:
        return "Prazo venceu: registrar desfecho ou avisar a família"
    if status == "selecionada":
        return "Avisar a família"
    if status == "contato_tentado":
        return "Tentar contato de novo"
    return "Aguardar a resposta da família"


def _enriquecer(c: Convocacao, extra: dict, agora: datetime | None = None) -> ConvocacaoOut:
    agora = agora or _agora()
    out = ConvocacaoOut.model_validate(c)
    out.unidade_nome, out.cre, out.aluno_anon, out.pontuacao = (
        extra.get("nome"), extra.get("cre"), extra.get("aluno_anon"), extra.get("pontuacao"))
    out.n_tentativas = int(extra.get("n_tentativas") or 0)
    out.horas_no_status = round((agora - _tz(c.atualizada_em)).total_seconds() / 3600, 1)
    out.atrasada = c.status in ABERTAS and c.prazo_fim is not None and _tz(c.prazo_fim) < agora
    out.proxima_acao = _proxima_acao(c.status, c.prazo_fim, agora)
    return out


# --- núcleo das regras (reutilizado por API, família, rotina e seed) ------------------------------

def _criar_convocacao(db: Session, a: Alocacao, agora: datetime, prazo: datetime | None = None) -> Convocacao:
    """Cria a convocação (status `selecionada`) a partir de uma alocação. Não grava o evento: chame
    `_registrar_selecao` depois do flush (o evento precisa do id)."""
    c = Convocacao(alocacao_id=a.id, inscricao_id=a.inscricao_id, unidade_codigo=a.unidade_codigo,
                   grupamento=a.grupamento, horario=a.horario, status="selecionada",
                   prazo_fim=prazo or _prazo(agora), criada_em=agora, atualizada_em=agora)
    db.add(c)
    return c


def _registrar_selecao(db: Session, c: Convocacao, agora: datetime, rodada_id: int, tipo: str = "selecionada",
                       ator: str = "sistema", extra: dict | None = None) -> Evento:
    ev = Evento(ocorrido_em=agora, tipo=tipo, convocacao_id=c.id, inscricao_id=c.inscricao_id,
                unidade_codigo=c.unidade_codigo, ator=ator,
                payload={"rodada_id": rodada_id, "prazo_fim": c.prazo_fim.isoformat() if c.prazo_fim else None,
                         **(extra or {})})
    db.add(ev)
    return ev


def _aplicar_transicao(db: Session, c: Convocacao, novo: str, ator: str, payload: dict | None,
                       agora: datetime) -> Evento:
    """Aplica uma transição de status com carimbo de tempo `agora` e grava o evento. Levanta 409 se inválida."""
    if novo not in TRANSICOES[c.status]:
        raise HTTPException(409, f"transição inválida: {c.status} → {novo}")
    ev = Evento(ocorrido_em=agora, tipo=novo, convocacao_id=c.id, inscricao_id=c.inscricao_id,
                unidade_codigo=c.unidade_codigo, ator=ator, payload=payload)
    db.add(ev)
    if novo == "contato_confirmado" and c.status != "contato_confirmado":
        # o relógio de 3 dias começa a contar do contato confirmado, não do envio
        c.prazo_fim = _prazo(agora)
    c.status = novo
    c.atualizada_em = agora
    if novo in LIBERAM_VAGA:
        a = db.get(Alocacao, c.alocacao_id)
        if a:
            a.vaga_liberada = True   # a vaga volta ao pool: próxima rodada `rematch` (ou "convocar próximo") a redistribui
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
    return ev


def gerar_convocacoes(db: Session, rodada: Rodada, agora: datetime, ator: str = "sistema") -> dict:
    """Cria uma convocação (`selecionada`) por vaga PRESA da rodada, sem duplicar o que já está na rua.

    Chamada pelo endpoint `/convocacoes/gerar` e pelo motor contínuo (`app/motor.py`), que reclassifica
    sozinho quando a entrada muda. Como uma rodada nova refaz as alocações do zero, a mesma criança
    reapareceria com as mesmas vagas: são puladas as alocações de quem já confirmou matrícula, as da mesma
    unidade/grupamento/turno que a criança já recebeu (aberta, recusada ou vencida — nunca se reconvoca para
    o mesmo lugar) e as que passariam da cota de reservas abertas da rodada (`vagas_presas`).
    """
    cota = int((rodada.parametros or {}).get("vagas_presas") or 3)
    ja_aloc = set(db.scalars(
        select(Convocacao.alocacao_id).join(Alocacao, Alocacao.id == Convocacao.alocacao_id)
        .where(Alocacao.rodada_id == rodada.id)).all())
    alocs = db.scalars(
        select(Alocacao).where(Alocacao.rodada_id == rodada.id, Alocacao.status == "alocada",
                               Alocacao.tipo == "presa")
        .order_by(Alocacao.inscricao_id, Alocacao.posicao_fila, Alocacao.id)).all()
    ids = sorted({a.inscricao_id for a in alocs})
    abertas_por_crianca: dict[int, int] = {}
    confirmadas: set[int] = set()
    ocupadas: set[tuple] = set()
    for lote in range(0, len(ids), 5000):
        for c in db.scalars(select(Convocacao).where(Convocacao.inscricao_id.in_(ids[lote:lote + 5000]))).all():
            if c.status == "confirmada":
                confirmadas.add(c.inscricao_id)
            if c.status in ABERTAS:
                abertas_por_crianca[c.inscricao_id] = abertas_por_crianca.get(c.inscricao_id, 0) + 1
            if c.status != "liberada":
                ocupadas.add((c.inscricao_id, c.unidade_codigo, c.grupamento, c.horario))
    prazo = _prazo(agora)
    novas, puladas = [], 0
    for a in alocs:
        if a.id in ja_aloc:
            continue
        if (a.inscricao_id in confirmadas
                or (a.inscricao_id, a.unidade_codigo, a.grupamento, a.horario) in ocupadas
                or abertas_por_crianca.get(a.inscricao_id, 0) >= cota):
            puladas += 1
            continue
        novas.append(_criar_convocacao(db, a, agora, prazo))
        abertas_por_crianca[a.inscricao_id] = abertas_por_crianca.get(a.inscricao_id, 0) + 1
    db.flush()
    for c in novas:
        _registrar_selecao(db, c, agora, rodada.id, ator=ator)
    return {"criadas": len(novas), "ja_existentes": len(ja_aloc), "puladas": puladas, "prazo_fim": prazo}


def expirar_vencidas(db: Session, cre: str | None = None, unidade: str | None = None, ator: str = "sistema",
                     agora: datetime | None = None) -> list[int]:
    """Registra `expirada` em toda convocação aberta com prazo vencido no recorte. Devolve os ids."""
    agora = agora or _agora()
    stmt = (select(Convocacao).join(Unidade, Unidade.codigo == Convocacao.unidade_codigo)
            .where(Convocacao.status.in_(ABERTAS), Convocacao.prazo_fim < agora))
    if cre:
        stmt = stmt.where(Unidade.cre == cre)
    if unidade:
        stmt = stmt.where(Convocacao.unidade_codigo == unidade)
    ids = []
    for c in db.scalars(stmt.order_by(Convocacao.prazo_fim, Convocacao.id)).all():
        _aplicar_transicao(db, c, "expirada", ator, {"motivo": "prazo_vencido", "em_lote": True}, agora)
        ids.append(c.id)
    return ids


def proximo_da_fila(db: Session, rodada_id: int, unidade: str, grupamento: str, horario: str) -> ProximoDaFila | None:
    """Próxima criança da lista de espera da unidade que ainda pode receber esta vaga.

    Segue a `posicao_fila` do motor (mesma régua, mesma ordem). Pula quem já confirmou matrícula, quem já
    tem convocação nesta unidade (aberta, recusada ou vencida) e quem já segura `vagas_presas` reservas.
    """
    rodada = db.get(Rodada, rodada_id)
    cota = int((rodada.parametros or {}).get("vagas_presas", 3)) if rodada else 3
    candidatos = db.execute(
        select(Alocacao, Inscricao.aluno_anon)
        .join(Inscricao, Inscricao.id == Alocacao.inscricao_id)
        .where(Alocacao.rodada_id == rodada_id, Alocacao.unidade_codigo == unidade,
               Alocacao.grupamento == grupamento, Alocacao.horario == horario, Alocacao.status == "lista_espera")
        .order_by(Alocacao.posicao_fila, Alocacao.id)
    ).all()
    for lote in range(0, len(candidatos), 50):
        parte = candidatos[lote:lote + 50]
        ids = [a.inscricao_id for a, _ in parte]
        convs: dict[int, list[Convocacao]] = {i: [] for i in ids}
        for c in db.scalars(select(Convocacao).where(Convocacao.inscricao_id.in_(ids))).all():
            convs[c.inscricao_id].append(c)
        for a, aluno in parte:
            cs = convs[a.inscricao_id]
            if any(c.status == "confirmada" for c in cs):
                continue
            if any(c.unidade_codigo == unidade and c.status != "liberada" for c in cs):
                continue
            abertas = sum(1 for c in cs if c.status in ABERTAS)
            if abertas >= cota:
                continue
            ordem = ((a.motivo or {}).get("final") or {}).get("ordem")
            return ProximoDaFila(alocacao_id=a.id, inscricao_id=a.inscricao_id, aluno_anon=aluno, pontuacao=a.pontuacao,
                                 posicao_fila=a.posicao_fila, ordem=ordem, reservas_abertas=abertas)
    return None


def _repassada_para(db: Session, convocacao_id: int) -> int | None:
    return db.scalar(select(Evento.convocacao_id).where(
        Evento.tipo == "selecionada_da_lista",
        Evento.payload["origem_convocacao_id"].as_integer() == convocacao_id).limit(1))


# --- rotas ----------------------------------------------------------------------------------------

@router.post("/gerar", response_model=dict, status_code=201)
def gerar(body: GerarConvocacoesIn, db: Session = Depends(get_db)):
    """Cria uma convocação (status `selecionada`) por vaga PRESA da rodada — até `vagas_presas` por criança."""
    rodada = db.get(Rodada, body.rodada_id)
    if not rodada:
        raise HTTPException(404, "rodada não encontrada")
    res = gerar_convocacoes(db, rodada, _agora())
    db.commit()
    return {"rodada_id": body.rodada_id, "convocacoes_criadas": res["criadas"], "ja_existentes": res["ja_existentes"],
            "puladas": res["puladas"], "prazo_fim": res["prazo_fim"]}


@router.post("/expirar-vencidas", response_model=ExpirarVencidasOut, status_code=201)
def expirar_vencidas_em_lote(body: ExpirarVencidasIn, db: Session = Depends(get_db)):
    """Registra `expirada` em todas as convocações abertas com prazo vencido no recorte (CRE e/ou unidade)."""
    ids = expirar_vencidas(db, body.cre, body.unidade, body.ator or "polo")
    db.commit()
    return ExpirarVencidasOut(expiradas=len(ids), ids=ids)


@router.get("", response_model=Pagina[ConvocacaoOut])
def listar(cre: str | None = None, unidade: str | None = None, status: str | None = None,
           atrasadas: bool | None = None, fila: str | None = Query(None, pattern="^(" + "|".join(FILAS) + ")$"),
           page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    """`fila` são os recortes de trabalho do polo: vencidas · vencem_24h · sem_aviso · aguardando · abertas ·
    trabalho (abertas por urgência) · encerradas. Ordenação por urgência quando há fila."""
    agora = _agora()
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
        stmt = stmt.where(Convocacao.status.in_(ABERTAS), Convocacao.prazo_fim < agora)
    elif atrasadas is False:
        stmt = stmt.where(~(Convocacao.status.in_(ABERTAS) & (Convocacao.prazo_fim < agora)))
    if fila == "vencidas":
        stmt = stmt.where(Convocacao.status.in_(ABERTAS), Convocacao.prazo_fim < agora)
    elif fila == "vencem_24h":
        stmt = stmt.where(Convocacao.status.in_(ABERTAS), Convocacao.prazo_fim >= agora,
                          Convocacao.prazo_fim < agora + timedelta(hours=24))
    elif fila == "sem_aviso":
        stmt = stmt.where(Convocacao.status.in_(SEM_AVISO))
    elif fila == "aguardando":
        stmt = stmt.where(Convocacao.status == "contato_confirmado")
    elif fila in ("abertas", "trabalho"):
        stmt = stmt.where(Convocacao.status.in_(ABERTAS))
    elif fila == "encerradas":
        stmt = stmt.where(Convocacao.status.in_(ENCERRADAS))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    if fila == "encerradas":
        ordem = (Convocacao.atualizada_em.desc(), Convocacao.id)
    elif fila:
        ordem = (Convocacao.prazo_fim.asc().nulls_last(), Convocacao.id)      # mais urgente primeiro
    else:
        ordem = (Convocacao.atualizada_em, Convocacao.id)
    linhas = db.execute(stmt.order_by(*ordem).offset((page - 1) * size).limit(size)).all()
    tent = dict(db.execute(
        select(Evento.convocacao_id, func.count()).where(
            Evento.convocacao_id.in_([c.id for c, *_ in linhas]), Evento.tipo == "contato_tentado")
        .group_by(Evento.convocacao_id)).all()) if linhas else {}
    items = [_enriquecer(c, {"nome": n, "cre": cr, "aluno_anon": al, "pontuacao": pt, "n_tentativas": tent.get(c.id, 0)}, agora)
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
    if c.status in VAGA_LIBERADA:
        out.repassada_para = _repassada_para(db, c.id)
        if out.repassada_para is None:
            a = db.get(Alocacao, c.alocacao_id)
            if a:
                out.proximo_da_fila = proximo_da_fila(db, a.rodada_id, c.unidade_codigo, c.grupamento, c.horario)
    return out


@router.post("/{convocacao_id}/eventos", response_model=EventoRegistrado, status_code=201)
def registrar_evento(convocacao_id: int, body: EventoIn, db: Session = Depends(get_db)):
    c = db.get(Convocacao, convocacao_id)
    if not c:
        raise HTTPException(404, "convocação não encontrada")
    ev = _aplicar_transicao(db, c, TIPO_PARA_STATUS[body.tipo], body.ator or "polo", body.payload, _agora())
    db.commit()
    db.refresh(ev)
    det = detalhe(convocacao_id, db)
    return EventoRegistrado(status=det.status, evento=EventoOut.model_validate(ev), convocacao=det)


@router.post("/{convocacao_id}/convocar-proximo", response_model=ConvocacaoDetalhe, status_code=201)
def convocar_proximo(convocacao_id: int, body: ConvocarProximoIn, db: Session = Depends(get_db)):
    """A vaga desta convocação foi liberada (recusa, prazo vencido ou confirmação em outra unidade):
    convoca o próximo da lista de espera da unidade, na ordem do motor. Evento `selecionada_da_lista` —
    o mesmo nome que a SME já usa hoje ("Selecionado da lista")."""
    c = db.get(Convocacao, convocacao_id)
    if not c:
        raise HTTPException(404, "convocação não encontrada")
    if c.status not in VAGA_LIBERADA:
        raise HTTPException(409, "a vaga desta convocação ainda não foi liberada")
    ja = _repassada_para(db, c.id)
    if ja:
        raise HTTPException(409, f"esta vaga já foi repassada (convocação #{ja})")
    a = db.get(Alocacao, c.alocacao_id)
    prox = proximo_da_fila(db, a.rodada_id, c.unidade_codigo, c.grupamento, c.horario) if a else None
    if not prox:
        raise HTTPException(404, "ninguém na lista de espera desta unidade para este grupamento e turno")
    agora = _agora()
    nova = _criar_convocacao(db, db.get(Alocacao, prox.alocacao_id), agora)
    db.flush()
    _registrar_selecao(db, nova, agora, a.rodada_id, tipo="selecionada_da_lista", ator=body.ator or "polo",
                       extra={"origem_convocacao_id": c.id, "posicao_fila": prox.posicao_fila})
    db.commit()
    return detalhe(nova.id, db)
