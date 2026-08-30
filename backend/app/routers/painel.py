"""Painel da CRE/polo — KPIs calculados em SQL sobre convocacao/alocacao/evento."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import PainelResumo, PainelUnidade, SelecionadasAguardando

router = APIRouter(prefix="/painel", tags=["painel"])

ABERTAS_SQL = "('selecionada','contato_tentado','contato_confirmado')"


def _filtro(cre: str | None, unidade: str | None) -> tuple[str, dict]:
    conds, params = [], {}
    if cre:
        conds.append("u.cre = :cre")
        params["cre"] = cre
    if unidade:
        conds.append("c.unidade_codigo = :unidade")
        params["unidade"] = unidade
    return (" AND " + " AND ".join(conds)) if conds else "", params


@router.get("/resumo", response_model=PainelResumo)
def resumo(cre: str | None = None, unidade: str | None = None, db: Session = Depends(get_db)):
    where, params = _filtro(cre, unidade)
    base = f"FROM convocacao c JOIN unidade u ON u.codigo = c.unidade_codigo WHERE 1=1 {where}"
    faixas = db.execute(text(f"""
        SELECT
          COUNT(*) FILTER (WHERE c.status IN {ABERTAS_SQL}) AS abertas,
          COUNT(*) FILTER (WHERE c.status IN {ABERTAS_SQL} AND now() - c.atualizada_em < interval '24 hours') AS f0,
          COUNT(*) FILTER (WHERE c.status IN {ABERTAS_SQL} AND now() - c.atualizada_em >= interval '24 hours'
                                                            AND now() - c.atualizada_em < interval '48 hours') AS f1,
          COUNT(*) FILTER (WHERE c.status IN {ABERTAS_SQL} AND now() - c.atualizada_em >= interval '48 hours'
                                                            AND now() - c.atualizada_em < interval '72 hours') AS f2,
          COUNT(*) FILTER (WHERE c.status IN {ABERTAS_SQL} AND now() - c.atualizada_em >= interval '72 hours') AS f3,
          COUNT(*) FILTER (WHERE c.status IN {ABERTAS_SQL} AND (c.prazo_fim < now() OR now() - c.atualizada_em >= interval '72 hours')) AS risco,
          COUNT(*) FILTER (WHERE c.status IN ('selecionada','contato_tentado')) AS sem_contato,
          COUNT(*) FILTER (WHERE c.status = 'confirmada') AS confirmadas,
          COUNT(*) FILTER (WHERE c.status = 'recusada') AS recusadas,
          COUNT(*) FILTER (WHERE c.status = 'expirada') AS expiradas
        {base}
    """), params).one()
    # inconsistência: criança com vaga confirmada e ainda assim outra convocação aberta (deveria ter sido liberada)
    inconsist = db.execute(text(f"""
        SELECT COUNT(*) FROM (
          SELECT c.inscricao_id {base}
          GROUP BY c.inscricao_id
          HAVING COUNT(*) FILTER (WHERE c.status = 'confirmada') > 0
             AND COUNT(*) FILTER (WHERE c.status IN {ABERTAS_SQL}) > 0
        ) t
    """), params).scalar() or 0
    presas_media = db.execute(text(f"""
        SELECT COALESCE(AVG(n), 0) FROM (
          SELECT COUNT(*) AS n {base} AND c.status IN {ABERTAS_SQL} GROUP BY c.inscricao_id
        ) t
    """), params).scalar() or 0
    liberadas_hoje = db.execute(text(f"""
        SELECT COUNT(*) FROM evento e JOIN convocacao c ON c.id = e.convocacao_id
        JOIN unidade u ON u.codigo = c.unidade_codigo
        WHERE e.tipo IN ('recusada','expirada','liberada_por_confirmacao')
          AND e.ocorrido_em >= date_trunc('day', now()) {where}
    """), params).scalar() or 0
    liberadas = db.execute(text(f"""
        SELECT COUNT(*) FROM alocacao a JOIN convocacao c ON c.alocacao_id = a.id
        JOIN unidade u ON u.codigo = c.unidade_codigo WHERE a.vaga_liberada {where}
    """), params).scalar() or 0
    return PainelResumo(
        filtro={"cre": cre, "unidade": unidade},
        atualizado_em=datetime.now(timezone.utc),
        selecionadas_aguardando=SelecionadasAguardando(
            total=faixas.abertas, faixa_0_24h=faixas.f0, faixa_24_48h=faixas.f1,
            faixa_48_72h=faixas.f2, faixa_mais_72h=faixas.f3),
        vagas_em_risco=faixas.risco, sem_contato=faixas.sem_contato, inconsistencias=inconsist,
        vagas_presas_por_crianca=round(float(presas_media), 2), vagas_liberadas_hoje=int(liberadas_hoje),
        confirmadas=faixas.confirmadas, recusadas=faixas.recusadas, expiradas=faixas.expiradas,
        vagas_liberadas=liberadas,
    )


@router.get("/unidades", response_model=list[PainelUnidade])
def unidades(cre: str | None = None, ano: int | None = None, db: Session = Depends(get_db)):
    params: dict = {}
    cond_cre = ""
    if cre:
        cond_cre = "AND u.cre = :cre"
        params["cre"] = cre
    cond_ano = ""
    if ano:
        cond_ano = "AND cap.ano = :ano"
        params["ano"] = ano
    linhas = db.execute(text(f"""
        WITH conv AS (
          SELECT c.unidade_codigo,
                 COUNT(*) AS convocadas,
                 COUNT(*) FILTER (WHERE c.status = 'confirmada') AS confirmadas,
                 COUNT(*) FILTER (WHERE c.status IN {ABERTAS_SQL} AND c.prazo_fim < now()) AS em_atraso
          FROM convocacao c GROUP BY c.unidade_codigo
        ), aloc AS (
          SELECT a.unidade_codigo,
                 COUNT(*) FILTER (WHERE a.status = 'alocada' AND a.tipo = 'presa') AS alocadas,
                 COUNT(*) FILTER (WHERE a.vaga_liberada) AS liberadas
          FROM alocacao a
          WHERE a.rodada_id = (SELECT MAX(id) FROM rodada)
          GROUP BY a.unidade_codigo
        ), cap AS (
          SELECT cap.unidade_codigo, SUM(cap.vagas) AS vagas
          FROM capacidade cap WHERE 1=1 {cond_ano} GROUP BY cap.unidade_codigo
        )
        SELECT u.codigo, u.nome, u.cre,
               COALESCE(cap.vagas, 0) AS vagas, COALESCE(aloc.alocadas, 0) AS alocadas,
               COALESCE(conv.convocadas, 0) AS convocadas, COALESCE(conv.confirmadas, 0) AS confirmadas,
               COALESCE(conv.em_atraso, 0) AS em_atraso, COALESCE(aloc.liberadas, 0) AS liberadas
        FROM unidade u
        LEFT JOIN cap ON cap.unidade_codigo = u.codigo
        LEFT JOIN aloc ON aloc.unidade_codigo = u.codigo
        LEFT JOIN conv ON conv.unidade_codigo = u.codigo
        WHERE (conv.convocadas IS NOT NULL OR aloc.alocadas IS NOT NULL OR cap.vagas IS NOT NULL) {cond_cre}
        ORDER BY em_atraso DESC, convocadas DESC, u.nome
    """), params).all()
    return [PainelUnidade(unidade_codigo=r.codigo, unidade_nome=r.nome, cre=r.cre, vagas=int(r.vagas), alocadas=int(r.alocadas),
                          convocadas=int(r.convocadas), confirmadas=int(r.confirmadas), em_atraso=int(r.em_atraso),
                          liberadas=int(r.liberadas)) for r in linhas]
