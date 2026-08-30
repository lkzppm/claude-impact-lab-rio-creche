"""Rodadas de classificação: carrega a entrada do Postgres, roda o motor, persiste rodada + alocações."""
from __future__ import annotations

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.engine import matching
from app.engine.scoring import ItemRegua, pontuar
from app.models import Alocacao, Capacidade, Convocacao, Inscricao, Opcao, Pergunta, Processo, Resposta, Rodada, Unidade
from app.schemas import AlocacaoOut, Explicacao, Pagina, RodadaIn, RodadaOut

router = APIRouter(prefix="/classificacao", tags=["classificacao"])


def _montar_entrada(db: Session, ano: int, grupamento: str | None, horario: str | None):
    """Devolve {(grupamento, horario): (lista de Inscricao do motor, capacidade, opcao_id por (insc, unidade))}."""
    regua = [ItemRegua(p.ich_perg_id, p.pontuacao, p.criterio_desempate, p.ordem or 0)
             for p in db.scalars(select(Pergunta).where(Pergunta.ano == ano)).all()]
    if not regua:
        raise HTTPException(404, f"régua do processo {ano} não carregada")

    stmt = (
        select(Opcao.inscricao_id, Opcao.id, Opcao.ordem, Opcao.unidade_codigo, Opcao.grupamento, Opcao.horario,
               Inscricao.data_criacao)
        .join(Inscricao, Inscricao.id == Opcao.inscricao_id)
        .where(Inscricao.ano == ano)
    )
    if grupamento:
        stmt = stmt.where(Opcao.grupamento == grupamento)
    if horario:
        stmt = stmt.where(Opcao.horario == horario)
    linhas = db.execute(stmt.order_by(Opcao.inscricao_id, Opcao.ordem)).all()
    if not linhas:
        raise HTTPException(404, "nenhuma opção encontrada para o filtro")

    ids = sorted({l[0] for l in linhas})
    # respostas em lotes
    respostas: dict[int, dict[int, bool]] = defaultdict(dict)
    for lote in range(0, len(ids), 5000):
        for iid, perg, resp in db.execute(
            select(Resposta.inscricao_id, Resposta.ich_perg_id, Resposta.resposta)
            .where(Resposta.inscricao_id.in_(ids[lote:lote + 5000]))
        ):
            respostas[iid][perg] = resp
    pontos = {iid: pontuar(respostas.get(iid, {}), regua) for iid in ids}

    grupos: dict[tuple[str, str], dict[int, list[tuple[int, str, int]]]] = defaultdict(lambda: defaultdict(list))
    data_criacao: dict[int, object] = {}
    for iid, oid, ordem, unidade, grp, hor, dc in linhas:
        grupos[(grp, hor)][iid].append((ordem, unidade, oid))
        data_criacao[iid] = dc

    caps = db.execute(
        select(Capacidade.unidade_codigo, Capacidade.grupamento, Capacidade.horario, Capacidade.vagas)
        .where(Capacidade.ano == ano)
    ).all()
    cap_por_grupo: dict[tuple[str, str], dict[str, int]] = defaultdict(dict)
    for u, grp, hor, vagas in caps:
        cap_por_grupo[(grp, hor)][u] = int(vagas)

    entrada = {}
    for chave, por_insc in grupos.items():
        lista = []
        opcao_id = {}
        for iid, ops in por_insc.items():
            ops.sort()
            lista.append(matching.Inscricao(
                id=iid, pontuacao=pontos[iid].total, desempate=pontos[iid].desempate,
                data_criacao=data_criacao[iid], preferencias=tuple(u for _, u, _ in ops),
            ))
            for _, u, oid in ops:
                opcao_id[(iid, u)] = oid
        entrada[chave] = (lista, cap_por_grupo.get(chave, {}), opcao_id)
    return entrada, pontos


@router.post("/rodadas", response_model=RodadaOut, status_code=201)
def executar(body: RodadaIn, db: Session = Depends(get_db)):
    if not db.get(Processo, body.ano):
        raise HTTPException(404, f"processo {body.ano} não encontrado")
    entrada, pontos = _montar_entrada(db, body.ano, body.grupamento, body.horario)

    # No rematch, vagas liberadas (recusadas/expiradas) voltam ao pool e quem já confirmou sai da disputa
    excluidas: set[int] = set()
    if body.tipo == "rematch":
        excluidas = set(db.scalars(
            select(Convocacao.inscricao_id).where(Convocacao.status == "confirmada")
        ).all())

    resumo = Counter()
    por_ordem = Counter()
    hashes = []
    alocacoes: list[Alocacao] = []
    rodada = Rodada(ano=body.ano, tipo=body.tipo,
                    parametros={"vagas_presas": body.vagas_presas, "alternativas": body.alternativas,
                                "grupamento": body.grupamento, "horario": body.horario})
    db.add(rodada)
    db.flush()

    for (grp, hor), (lista, cap, opcao_id) in sorted(entrada.items()):
        lista = [i for i in lista if i.id not in excluidas]
        if body.tipo == "rematch":
            # capacidade líquida = vagas − confirmadas naquela unidade/grupamento/turno
            confirmadas = Counter(db.scalars(
                select(Convocacao.unidade_codigo).where(
                    Convocacao.status == "confirmada", Convocacao.grupamento == grp, Convocacao.horario == hor)
            ).all())
            cap = {u: max(0, v - confirmadas.get(u, 0)) for u, v in cap.items()}
        saida = matching.alocar(lista, cap, vagas_presas=body.vagas_presas, alternativas=body.alternativas)
        hashes.append(saida.hash_entrada)
        for r in saida.resultados.values():
            resumo["n_inscricoes"] += 1
            resumo[f"n_{r.status}"] += 1
            motivo = r.motivo()
            if r.status == matching.STATUS_SEM_OPCAO:
                alocacoes.append(Alocacao(
                    rodada_id=rodada.id, inscricao_id=r.inscricao_id, opcao_id=None, unidade_codigo=None,
                    grupamento=grp, horario=hor, status=r.status, tipo=None, posicao_fila=None,
                    pontuacao=r.pontuacao, motivo=motivo,
                ))
                continue
            if r.presas:
                resumo["n_criancas_com_alguma_presa"] += 1
                resumo["total_presas"] += len(r.presas)
                por_ordem[str(r.presas[0].ordem)] += 1     # ordem da melhor vaga presa
            # uma linha por vaga presa e por alternativa selecionável (até 5 por inscrição)
            for v in r.presas + r.selecionaveis:
                alocacoes.append(Alocacao(
                    rodada_id=rodada.id, inscricao_id=r.inscricao_id,
                    opcao_id=opcao_id.get((r.inscricao_id, v.unidade)), unidade_codigo=v.unidade,
                    grupamento=grp, horario=hor,
                    status=matching.STATUS_ALOCADA if v.tipo == matching.TIPO_PRESA else matching.STATUS_LISTA_ESPERA,
                    tipo=v.tipo, posicao_fila=v.posicao, pontuacao=r.pontuacao,
                    motivo={**motivo, "final": {"unidade": v.unidade, "ordem": v.ordem, "posicao": v.posicao, "tipo": v.tipo}},
                ))
        resumo["grupos"] += 1
        resumo["iteracoes"] += saida.iteracoes

    db.bulk_save_objects(alocacoes)
    rodada.hash_entrada = matching.hashlib.sha256("|".join(sorted(hashes)).encode()).hexdigest()
    rodada.resumo = {
        "n_inscricoes": resumo["n_inscricoes"],
        "n_alocadas": resumo["n_alocada"],
        "n_lista_espera": resumo["n_lista_espera"],
        "n_sem_opcao": resumo["n_sem_opcao_viavel"],
        "n_criancas_com_alguma_presa": resumo["n_criancas_com_alguma_presa"],
        "media_presas_por_crianca": round(resumo["total_presas"] / resumo["n_criancas_com_alguma_presa"], 3)
            if resumo["n_criancas_com_alguma_presa"] else 0.0,
        "por_ordem_da_opcao": dict(sorted(por_ordem.items())),
        "vagas_presas": body.vagas_presas,
        "alternativas": body.alternativas,
        "grupos": resumo["grupos"],
        "iteracoes": resumo["iteracoes"],
        "excluidas_ja_confirmadas": len(excluidas),
    }
    db.commit()
    db.refresh(rodada)
    return rodada


@router.get("/rodadas", response_model=list[RodadaOut])
def listar(db: Session = Depends(get_db)):
    return db.scalars(select(Rodada).order_by(Rodada.id.desc())).all()


@router.get("/rodadas/{rodada_id}", response_model=RodadaOut)
def detalhe(rodada_id: int, db: Session = Depends(get_db)):
    r = db.get(Rodada, rodada_id)
    if not r:
        raise HTTPException(404, "rodada não encontrada")
    return r


@router.get("/rodadas/{rodada_id}/alocacoes", response_model=Pagina[AlocacaoOut])
def alocacoes(rodada_id: int, unidade: str | None = None, status: str | None = None,
              page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    stmt = select(Alocacao).where(Alocacao.rodada_id == rodada_id)
    if unidade:
        stmt = stmt.where(Alocacao.unidade_codigo == unidade)
    if status:
        stmt = stmt.where(Alocacao.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    linhas = db.scalars(stmt.order_by(Alocacao.unidade_codigo, Alocacao.posicao_fila, Alocacao.id)
                        .offset((page - 1) * size).limit(size)).all()
    codigos = {a.unidade_codigo for a in linhas} | {p["unidade"] for a in linhas for p in (a.motivo or {}).get("propostas", [])}
    nomes = dict(db.execute(select(Unidade.codigo, Unidade.nome).where(Unidade.codigo.in_([c for c in codigos if c]))).all())
    alunos = dict(db.execute(select(Inscricao.id, Inscricao.aluno_anon).where(Inscricao.id.in_({a.inscricao_id for a in linhas}))).all())
    items = []
    for a in linhas:
        o = AlocacaoOut.model_validate(a)
        o.aluno_anon = alunos.get(a.inscricao_id)
        o.unidade_nome = nomes.get(a.unidade_codigo)
        if o.motivo:
            m = dict(o.motivo)
            m["propostas"] = [{**p, "unidade_nome": nomes.get(p.get("unidade"))} for p in m.get("propostas", [])]
            for chave in ("presas", "selecionaveis"):
                m[chave] = [{**v, "unidade_nome": nomes.get(v.get("unidade"))} for v in m.get(chave, [])]
            if m.get("final"):
                m["final"] = {**m["final"], "unidade_nome": nomes.get(m["final"].get("unidade"))}
            o.motivo = m
        items.append(o)
    return Pagina(items=items, total=total, page=page, size=size)


def _texto_explicacao(linhas: list[Alocacao], nomes: dict[str, str]) -> str:
    """Explicação em linguagem de responsável, gerada do log de decisão (sem LLM)."""
    nome = lambda u: nomes.get(u, u)  # noqa: E731
    a0 = linhas[0]
    m = a0.motivo or {}
    partes = [f"Sua inscrição tem {a0.pontuacao} ponto(s) pela régua do processo."]
    vistas: set[tuple] = set()
    for p in m.get("propostas", []):
        if p["resultado"] in ("rejeitada", "desbancada") and (p["unidade"], p["ordem"]) not in vistas:
            vistas.add((p["unidade"], p["ordem"]))
            corte = p.get("corte")
            partes.append(
                f"Na {p['ordem']}ª opção ({nome(p['unidade'])}) as {p['vagas']} vaga(s) foram para crianças com pontuação "
                + (f"maior ou igual a {corte}." if corte is not None else "superior ou com desempate.")
            )
    presas = [a for a in linhas if a.tipo == "presa"]
    selec = [a for a in linhas if a.tipo == "selecionavel"]
    if presas:
        desc = "; ".join(f"{(a.motivo or {}).get('final', {}).get('ordem')}ª opção, {nome(a.unidade_codigo)} "
                         f"(posição {a.posicao_fila})" for a in presas)
        partes.append(f"Resultado: {len(presas)} vaga(s) reservada(s) para você — {desc}. "
                      "Ao confirmar uma delas, as outras são liberadas na hora para a próxima criança da fila.")
    elif selec:
        partes.append("Resultado: lista de espera.")
    else:
        partes.append("Resultado: nenhuma das unidades escolhidas oferece vaga neste grupamento e turno. "
                      "Vale revisar as opções na próxima inscrição.")
    if selec:
        desc = "; ".join(f"{nome(a.unidade_codigo)} (sua {(a.motivo or {}).get('final', {}).get('ordem')}ª opção, "
                         f"posição {a.posicao_fila} da fila)" for a in selec)
        partes.append(f"Alternativas em espera: {desc}. Se uma vaga abrir, a convocação chega pelo canal de contato.")
    return " ".join(partes)


@router.get("/rodadas/{rodada_id}/explicacao/{inscricao_id}", response_model=Explicacao)
def explicacao(rodada_id: int, inscricao_id: int, db: Session = Depends(get_db)):
    linhas = db.scalars(select(Alocacao).where(Alocacao.rodada_id == rodada_id, Alocacao.inscricao_id == inscricao_id)
                        .order_by(Alocacao.tipo.desc().nulls_last(), Alocacao.id)).all()
    if not linhas:
        raise HTTPException(404, "alocação não encontrada")
    codigos = {p["unidade"] for p in (linhas[0].motivo or {}).get("propostas", [])} | {a.unidade_codigo for a in linhas}
    nomes = dict(db.execute(select(Unidade.codigo, Unidade.nome).where(Unidade.codigo.in_([c for c in codigos if c]))).all())
    status = "alocada" if any(a.tipo == "presa" for a in linhas) else linhas[0].status
    return Explicacao(inscricao_id=inscricao_id, rodada_id=rodada_id, status=status,
                      texto=_texto_explicacao(linhas, nomes), motivo=linhas[0].motivo)
