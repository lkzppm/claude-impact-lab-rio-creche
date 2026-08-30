"""Visão da FAMÍLIA: uma inscrição, em linguagem de responsável, e a resposta às vagas reservadas.

Sem login nesta fase: o código é o `aluno_anon` da base anonimizada (ou o id da inscrição). Em produção
o acesso é pelo CPF do responsável validado no gov.br / matricula.rio.
"""
from __future__ import annotations

from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Alocacao, Comprovacao, Convocacao, Inscricao, Opcao, Pergunta, Resposta, Rodada, Unidade
from app.routers.classificacao import _texto_explicacao
from app.routers.convocacoes import ABERTAS, _agora, registrar_evento
from app.schemas import (ComprovacaoOut, EventoIn, EventoRegistrado, FamiliaConvocacao, FamiliaCriterio,
                         FamiliaInscricao, FamiliaOpcao, FamiliaPontuacao, FamiliaResposta, FamiliaVisao, RodadaRef)

router = APIRouter(prefix="/familia", tags=["familia"])

# critério da régua → critério do provedor de comprovação
CRITERIO_COMPROVACAO = {
    "cadúnico": "cadunico", "cadunico": "cadunico", "cadastro único": "cadunico",
    "bolsa família": "bolsa_familia", "bolsa familia": "bolsa_familia",
    "deficiência": "educacao_especial", "educação especial": "educacao_especial",
}


def _localizar(db: Session, codigo: str, ano: int | None) -> Inscricao:
    """Acha a inscrição da família. Uma criança pode ter mais de uma inscrição no mesmo processo (colisão de
    identidade ou reinscrição — achado da auditoria); preferimos a que tem convocação, depois a que foi
    classificada, depois a mais recente."""
    if codigo.isdigit():
        i = db.get(Inscricao, int(codigo))
        if i:
            return i
    q = select(Inscricao).where(Inscricao.aluno_anon == codigo)
    if ano:
        q = q.where(Inscricao.ano == ano)
    candidatas = db.scalars(q.order_by(Inscricao.ano.desc(), Inscricao.id.desc())).all()
    if not candidatas:
        raise HTTPException(404, "Não encontramos uma inscrição com esse código.")
    ids = [c.id for c in candidatas]
    com_conv = set(db.scalars(select(Convocacao.inscricao_id).where(Convocacao.inscricao_id.in_(ids))).all())
    com_aloc = set(db.scalars(select(Alocacao.inscricao_id).where(Alocacao.inscricao_id.in_(ids))).all())
    for grupo in (com_conv, com_aloc):
        for c in candidatas:
            if c.id in grupo:
                return c
    return candidatas[0]


def _criterio_comprovacao(texto: str) -> str | None:
    t = texto.lower()
    for chave, crit in CRITERIO_COMPROVACAO.items():
        if chave in t:
            return crit
    return None


@router.get("/inscricao", response_model=FamiliaVisao)
def visao(codigo: str = Query(..., min_length=1), ano: int | None = None, db: Session = Depends(get_db)):
    i = _localizar(db, codigo.strip(), ano)
    opcoes = db.scalars(select(Opcao).where(Opcao.inscricao_id == i.id).order_by(Opcao.ordem)).all()
    codigos = {o.unidade_codigo for o in opcoes}
    unidades = {u.codigo: u for u in db.scalars(select(Unidade).where(Unidade.codigo.in_(codigos))).all()} if codigos else {}

    # pontuação: régua do ano × respostas × comprovações
    regua = db.scalars(select(Pergunta).where(Pergunta.ano == i.ano).order_by(Pergunta.ordem)).all()
    respostas = {r.ich_perg_id: r for r in db.scalars(select(Resposta).where(Resposta.inscricao_id == i.id)).all()}
    comprovacoes = db.scalars(select(Comprovacao).where(Comprovacao.inscricao_id == i.id)
                              .order_by(Comprovacao.consultado_em.desc())).all()
    ultima_por_criterio: dict[str, str] = {}
    for c in comprovacoes:
        ultima_por_criterio.setdefault(c.criterio, c.resultado)
    criterios = []
    for p in regua:
        if p.pontuacao <= 0 and not p.criterio_desempate:
            continue
        r = respostas.get(p.ich_perg_id)
        crit = _criterio_comprovacao(p.texto)
        criterios.append(FamiliaCriterio(
            ich_perg_id=p.ich_perg_id, texto=p.texto, pontos=p.pontuacao, desempate=p.criterio_desempate,
            declarado=bool(r and r.resposta), comprovado=ultima_por_criterio.get(crit) if crit else None))
    maxima = sum(p.pontuacao for p in regua if p.pontuacao > 0 and not p.criterio_desempate)
    pontuacao = FamiliaPontuacao(total=i.pontuacao, maxima=maxima, criterios=criterios)

    # rodada de referência: a que gerou as convocações desta criança (se houver); senão a última em que ela entrou
    convs = db.scalars(select(Convocacao).where(Convocacao.inscricao_id == i.id).order_by(Convocacao.id)).all()
    rodada = None
    if convs:
        a_ref = db.get(Alocacao, convs[-1].alocacao_id)
        rodada = db.get(Rodada, a_ref.rodada_id) if a_ref else None
    if rodada is None:
        rodada = db.scalars(select(Rodada).join(Alocacao, Alocacao.rodada_id == Rodada.id)
                            .where(Alocacao.inscricao_id == i.id).order_by(Rodada.id.desc()).limit(1)).first()
    alocs = db.scalars(select(Alocacao).where(Alocacao.rodada_id == rodada.id, Alocacao.inscricao_id == i.id)
                       .order_by(Alocacao.tipo.desc().nulls_last(), Alocacao.id)).all() if rodada else []
    por_opcao = {a.opcao_id: a for a in alocs if a.opcao_id}
    sem_opcao = any(a.status == "sem_opcao_viavel" for a in alocs)

    conv_unidades = {c.unidade_codigo for c in convs} - set(unidades)
    if conv_unidades:
        unidades.update({u.codigo: u for u in db.scalars(select(Unidade).where(Unidade.codigo.in_(conv_unidades))).all()})
    confirmada = next((c for c in convs if c.status == "confirmada"), None)
    abertas = [c for c in convs if c.status in ABERTAS]

    def resultado_opcao(o: Opcao) -> tuple[str | None, int | None]:
        a = por_opcao.get(o.id)
        if rodada is None:
            return None, None
        if a is None:
            return "sem_vaga", None
        if a.tipo == "presa":
            return "reservada", a.posicao_fila
        return "fila", a.posicao_fila

    out_opcoes = []
    for o in opcoes:
        res, pos = resultado_opcao(o)
        u = unidades.get(o.unidade_codigo)
        out_opcoes.append(FamiliaOpcao(ordem=o.ordem, unidade_codigo=o.unidade_codigo,
                                       unidade_nome=u.nome if u else None, bairro=u.bairro if u else None,
                                       situacao_origem=o.situacao_origem, resultado=res, posicao=pos))

    agora = _agora()
    out_convs = []
    for c in convs:
        prazo = c.prazo_fim
        if prazo is not None and prazo.tzinfo is None:
            prazo = prazo.replace(tzinfo=timezone.utc)
        horas = round((prazo - agora).total_seconds() / 3600, 1) if prazo else None
        u = unidades.get(c.unidade_codigo)
        out_convs.append(FamiliaConvocacao(id=c.id, unidade_codigo=c.unidade_codigo, unidade_nome=u.nome if u else None,
                                           status=c.status, prazo_fim=c.prazo_fim, horas_restantes=horas,
                                           pode_responder=c.status in ABERTAS))

    if confirmada:
        situacao = "matricula_confirmada"
    elif abertas:
        situacao = "reservas_abertas"
    elif rodada is None:
        situacao = "aguardando_classificacao"
    elif sem_opcao:
        situacao = "sem_opcao_viavel"
    else:
        situacao = "lista_espera"

    grup = opcoes[0].grupamento if opcoes else None
    hor = opcoes[0].horario if opcoes else None
    explicacao = _texto_explicacao(alocs, {k: (u.nome or k) for k, u in unidades.items()}) if alocs else None

    return FamiliaVisao(
        inscricao=FamiliaInscricao(id=i.id, ano=i.ano, aluno_anon=i.aluno_anon, nascimento_anomes=i.nascimento_anomes,
                                   grupamento=grup, horario=hor, bairro=i.bairro, pontuacao=i.pontuacao,
                                   data_criacao=i.data_criacao),
        pontuacao=pontuacao, opcoes=out_opcoes,
        rodada=RodadaRef(id=rodada.id, criada_em=rodada.criada_em, tipo=rodada.tipo) if rodada else None,
        explicacao=explicacao, convocacoes=out_convs,
        comprovacoes=[ComprovacaoOut.model_validate(c) for c in comprovacoes],
        situacao_resumo=situacao,
    )


@router.post("/convocacoes/{convocacao_id}/responder", response_model=EventoRegistrado, status_code=201)
def responder(convocacao_id: int, body: FamiliaResposta, db: Session = Depends(get_db)):
    """A família confirma ou recusa uma vaga reservada, na conversa — sem esperar os 3 dias.

    Confirmar registra o contato (o relógio passa a contar dele) e em seguida a confirmação; as outras
    reservas da criança são liberadas na hora pelo fluxo de `registrar_evento`.
    """
    c = db.get(Convocacao, convocacao_id)
    if not c:
        raise HTTPException(404, "Essa vaga reservada não existe mais.")
    if c.status not in ABERTAS:
        raise HTTPException(409, "Essa reserva já foi respondida ou expirou.")
    if body.resposta == "confirmar":
        if c.status != "contato_confirmado":
            registrar_evento(convocacao_id, EventoIn(tipo="contato_confirmado", ator="familia",
                                                     payload={"canal": "painel_familia"}), db)
        return registrar_evento(convocacao_id, EventoIn(tipo="matricula_confirmada", ator="familia",
                                                        payload={"canal": "painel_familia"}), db)
    return registrar_evento(convocacao_id, EventoIn(tipo="recusa", ator="familia",
                                                    payload={"canal": "painel_familia"}), db)
