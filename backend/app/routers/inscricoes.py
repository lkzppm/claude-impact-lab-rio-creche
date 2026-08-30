from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.engine.scoring import ItemRegua, pontuar
from app.models import Inscricao, Opcao, Pergunta, Unidade
from app.schemas import InscricaoDetalhe, InscricaoOut, OpcaoOut, Pagina, RespostaOut

router = APIRouter(prefix="/inscricoes", tags=["inscricoes"])


@router.get("", response_model=Pagina[InscricaoOut])
def listar(ano: int | None = None, unidade: str | None = None, situacao: str | None = None,
           page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    stmt = select(Inscricao)
    if ano:
        stmt = stmt.where(Inscricao.ano == ano)
    if unidade or situacao:
        sub = select(Opcao.inscricao_id)
        if unidade:
            sub = sub.where(Opcao.unidade_codigo == unidade)
        if situacao:
            sub = sub.where(Opcao.situacao_origem == situacao)
        stmt = stmt.where(Inscricao.id.in_(sub))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Inscricao.id).offset((page - 1) * size).limit(size)).all()
    return Pagina(items=items, total=total, page=page, size=size)


@router.get("/{inscricao_id}", response_model=InscricaoDetalhe)
def detalhe(inscricao_id: int, db: Session = Depends(get_db)):
    i = db.scalar(
        select(Inscricao).where(Inscricao.id == inscricao_id)
        .options(selectinload(Inscricao.opcoes), selectinload(Inscricao.respostas))
    )
    if not i:
        raise HTTPException(404, "inscrição não encontrada")
    nomes = dict(db.execute(select(Unidade.codigo, Unidade.nome)
                            .where(Unidade.codigo.in_([o.unidade_codigo for o in i.opcoes]))).all())
    regua = {p.ich_perg_id: p for p in db.scalars(select(Pergunta).where(Pergunta.ano == i.ano)).all()}
    out = InscricaoDetalhe.model_validate(i)
    # pontuação sempre derivada das respostas × régua do ano (a coluna persistida é cache da carga)
    out.pontuacao = pontuar({r.ich_perg_id: r.resposta for r in i.respostas},
                            [ItemRegua(p.ich_perg_id, p.pontuacao, p.criterio_desempate, p.ordem or 0) for p in regua.values()]).total
    out.opcoes = [OpcaoOut(id=o.id, ordem=o.ordem, unidade_codigo=o.unidade_codigo, unidade_nome=nomes.get(o.unidade_codigo),
                           grupamento=o.grupamento, horario=o.horario, situacao_origem=o.situacao_origem) for o in i.opcoes]
    out.respostas = sorted(
        (RespostaOut(ich_perg_id=r.ich_perg_id, texto=regua[r.ich_perg_id].texto if r.ich_perg_id in regua else None,
                     resposta=r.resposta, confirmado=r.confirmado,
                     pontuacao=regua[r.ich_perg_id].pontuacao if r.ich_perg_id in regua else None) for r in i.respostas),
        key=lambda r: (regua[r.ich_perg_id].ordem or 0) if r.ich_perg_id in regua else 999)
    return out


# --- Comprovação via bases oficiais (provedores em app/integracoes) --------------------------------
from app.integracoes.base import DadosInscricao, ResultadoComprovacao  # noqa: E402
from app.integracoes.registry import provedores  # noqa: E402
from app.models import Comprovacao  # noqa: E402
from app.schemas import ComprovacaoOut  # noqa: E402


@router.post("/{inscricao_id}/comprovar", response_model=list[ComprovacaoOut], status_code=201)
def comprovar(inscricao_id: int, db: Session = Depends(get_db)):
    """Consulta todos os provedores ativos e grava uma linha por critério. Não altera a pontuação."""
    i = db.scalar(select(Inscricao).where(Inscricao.id == inscricao_id).options(selectinload(Inscricao.respostas)))
    if not i:
        raise HTTPException(404, "inscrição não encontrada")
    dados = DadosInscricao(inscricao_id=i.id, ano=i.ano, aluno_anon=i.aluno_anon, responsavel_anon=i.responsavel_anon,
                           nascimento_anomes=i.nascimento_anomes, cep=i.cep,
                           respostas={r.ich_perg_id: r.resposta for r in i.respostas})
    linhas = []
    for p in provedores():
        try:
            r = p.consultar(dados)
        except Exception as exc:  # noqa: BLE001 — provedor nunca derruba a rota
            r = ResultadoComprovacao(p.criterio, p.fonte, "erro", None, {"erro": f"{type(exc).__name__}: {exc}"})
        c = Comprovacao(inscricao_id=i.id, criterio=r.criterio, fonte=r.fonte, resultado=r.resultado,
                        protocolo=r.protocolo, payload=r.payload)
        db.add(c)
        linhas.append(c)
    db.commit()
    for c in linhas:
        db.refresh(c)
    return linhas


@router.get("/{inscricao_id}/comprovacoes", response_model=list[ComprovacaoOut])
def comprovacoes(inscricao_id: int, db: Session = Depends(get_db)):
    if not db.get(Inscricao, inscricao_id):
        raise HTTPException(404, "inscrição não encontrada")
    return db.scalars(select(Comprovacao).where(Comprovacao.inscricao_id == inscricao_id)
                      .order_by(Comprovacao.consultado_em.desc(), Comprovacao.id.desc())).all()
