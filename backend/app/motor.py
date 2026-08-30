"""Motor contínuo — o núcleo determinístico trabalhando sozinho, sem ninguém apertar botão.

A classificação deixa de ser um evento de calendário ("rodar a classificação") e vira um serviço que roda
24 h por dia. A cada `MOTOR_INTERVALO_SEGUNDOS` o motor executa um ciclo:

1. **classifica** o processo vigente quando ainda não há rodada (bootstrap) ou quando a entrada mudou —
   inscrição nova, opção nova, capacidade informada pela unidade (assinatura da entrada em `_assinatura`);
2. **convoca** as vagas presas da rodada nova, sem duplicar o que já está na rua
   (`convocacoes.gerar_convocacoes`);
3. **expira** as convocações com prazo vencido, se `MOTOR_EXPIRAR_VENCIDAS` estiver ligado (ator `motor`);
4. **cascateia**: toda vaga liberada — recusa, prazo vencido, confirmação em outra unidade — que ainda não
   foi repassada vai para o próximo da lista de espera daquela unidade, na ordem do motor. É o passo que
   hoje depende de alguém lembrar de "selecionar da lista"; aqui ele acontece em minutos, não em semanas.

Sem LLM em qualquer um dos passos: é a mesma régua (Res. SME), o mesmo Deferred Acceptance e as mesmas
funções que a API do polo usa. Cada ação vira `Evento` no log append-only com ator `motor`, e o ciclo em si
é registrado (`motor_ciclo`) quando muda alguma coisa — a auditoria vê o que o motor fez e quando.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Alocacao, Capacidade, Convocacao, Evento, Inscricao, Opcao, Processo, Rodada
from app.routers import classificacao
from app.routers.convocacoes import (
    VAGA_LIBERADA,
    _criar_convocacao,
    _registrar_selecao,
    expirar_vencidas,
    gerar_convocacoes,
    proximo_da_fila,
)
from app.schemas import RodadaIn

log = logging.getLogger("creche.motor")

ATOR = "motor"


@dataclass
class Ciclo:
    """O que o motor fez em uma passada."""
    em: datetime
    duracao_ms: int = 0
    ano: int | None = None
    rodada_id: int | None = None
    rodada_criada: bool = False
    motivo_rodada: str | None = None       # bootstrap | entrada_mudou
    convocacoes_criadas: int = 0
    expiradas: int = 0
    repassadas: int = 0
    vagas_sem_fila: int = 0                # liberadas sem ninguém elegível na fila da unidade
    erro: str | None = None

    @property
    def mudou_algo(self) -> bool:
        return bool(self.rodada_criada or self.convocacoes_criadas or self.expiradas or self.repassadas)

    def dict(self) -> dict:
        return asdict(self)


@dataclass
class Estado:
    """Estado em memória do motor — o que o painel mostra em "o motor está rodando"."""
    ligado: bool = False
    intervalo_s: int = 0
    expira_vencidas: bool = False
    executando: bool = False
    iniciado_em: datetime | None = None
    ultima_execucao: datetime | None = None
    proxima_execucao: datetime | None = None
    ciclos: int = 0
    total_rodadas: int = 0
    total_convocacoes: int = 0
    total_expiradas: int = 0
    total_repassadas: int = 0
    ultimo_ciclo: Ciclo | None = None
    ultimo_erro: str | None = None
    # assinatura da entrada vista no último ciclo; None = ainda não observada (não dispara reclassificação)
    assinatura: dict[str, int] | None = field(default=None, repr=False)

    def registrar(self, c: Ciclo) -> None:
        self.ciclos += 1
        self.ultima_execucao = c.em
        self.ultimo_ciclo = c
        self.ultimo_erro = c.erro
        self.total_rodadas += int(c.rodada_criada)
        self.total_convocacoes += c.convocacoes_criadas
        self.total_expiradas += c.expiradas
        self.total_repassadas += c.repassadas


ESTADO = Estado()


def _assinatura(db: Session, ano: int) -> dict[str, int]:
    """Impressão digital barata da entrada do motor. Muda quando entra inscrição, opção ou vaga."""
    n_insc = db.scalar(select(func.count()).select_from(Inscricao).where(Inscricao.ano == ano)) or 0
    n_opc = db.scalar(
        select(func.count()).select_from(Opcao)
        .join(Inscricao, Inscricao.id == Opcao.inscricao_id).where(Inscricao.ano == ano)
    ) or 0
    vagas = db.scalar(select(func.coalesce(func.sum(Capacidade.vagas), 0)).where(Capacidade.ano == ano)) or 0
    return {"inscricoes": int(n_insc), "opcoes": int(n_opc), "vagas": int(vagas)}


def _classificar(db: Session, ano: int, anterior: Rodada | None) -> Rodada | None:
    """Roda uma classificação `inicial` no mesmo recorte da anterior (ou no configurado, no bootstrap)."""
    cfg = get_settings()
    p = (anterior.parametros or {}) if anterior else {}
    corpo = RodadaIn(
        ano=ano,
        grupamento=p.get("grupamento") if anterior else (cfg.motor_grupamento or None),
        horario=p.get("horario") if anterior else (cfg.motor_horario or None),
        tipo="inicial",
        vagas_presas=int(p.get("vagas_presas") or cfg.motor_vagas_presas),
        alternativas=int(p.get("alternativas") if p.get("alternativas") is not None else cfg.motor_alternativas),
    )
    try:
        return classificacao.executar(corpo, db)
    except HTTPException as e:                       # régua não carregada, nenhuma opção no recorte…
        db.rollback()
        log.info("motor: nada a classificar em %s (%s)", ano, e.detail)
        return anterior


def _repassar_liberadas(db: Session, agora: datetime, limite: int) -> tuple[int, int]:
    """Cascata: cada vaga liberada e ainda não repassada vai para o próximo da fila daquela unidade.

    Devolve (repassadas, vagas sem ninguém elegível na fila). Usa exatamente `proximo_da_fila` — a mesma
    ordem que o polo vê na tela da unidade —, então o resultado é conferível linha a linha.
    """
    repassadas = {
        int(p["origem_convocacao_id"])
        for p in db.scalars(select(Evento.payload).where(Evento.tipo == "selecionada_da_lista")).all()
        if isinstance(p, dict) and p.get("origem_convocacao_id") is not None
    }
    liberadas = db.scalars(
        select(Convocacao).where(Convocacao.status.in_(VAGA_LIBERADA))
        .order_by(Convocacao.atualizada_em, Convocacao.id)
    ).all()
    n = sem_fila = 0
    for c in liberadas:
        if c.id in repassadas:
            continue
        a = db.get(Alocacao, c.alocacao_id)
        if a is None:
            continue
        prox = proximo_da_fila(db, a.rodada_id, c.unidade_codigo, c.grupamento, c.horario)
        if prox is None:
            sem_fila += 1
            continue
        nova = _criar_convocacao(db, db.get(Alocacao, prox.alocacao_id), agora)
        db.flush()
        _registrar_selecao(db, nova, agora, a.rodada_id, tipo="selecionada_da_lista", ator=ATOR,
                           extra={"origem_convocacao_id": c.id, "posicao_fila": prox.posicao_fila,
                                  "motivo": "vaga_liberada"})
        repassadas.add(c.id)
        n += 1
        if n >= limite:
            break
    return n, sem_fila


def executar_ciclo(db: Session, agora: datetime | None = None) -> Ciclo:
    """Uma passada do motor. Nunca levanta: erro vira `ciclo.erro` e o motor continua vivo."""
    cfg = get_settings()
    t0 = time.perf_counter()
    agora = agora or datetime.now(timezone.utc)
    c = Ciclo(em=agora)
    ESTADO.executando = True
    try:
        ano = db.scalar(select(func.max(Processo.ano)))
        c.ano = ano
        if ano is None:
            c.erro = "nenhum processo carregado — rode `make load`"
        else:
            rodada = db.scalars(select(Rodada).where(Rodada.ano == ano).order_by(Rodada.id.desc()).limit(1)).first()
            assinatura = _assinatura(db, ano)
            if rodada is None:
                rodada, c.rodada_criada, c.motivo_rodada = _classificar(db, ano, None), True, "bootstrap"
            elif ESTADO.assinatura is not None and ESTADO.assinatura != assinatura:
                rodada, c.rodada_criada, c.motivo_rodada = _classificar(db, ano, rodada), True, "entrada_mudou"
            ESTADO.assinatura = assinatura
            if rodada is None:                       # bootstrap sem entrada: só volta no próximo ciclo
                c.rodada_criada, c.motivo_rodada = False, None
            else:
                c.rodada_id = rodada.id
                if c.rodada_criada:
                    c.convocacoes_criadas = gerar_convocacoes(db, rodada, agora, ator=ATOR)["criadas"]
            if cfg.motor_expirar_vencidas:
                c.expiradas = len(expirar_vencidas(db, ator=ATOR, agora=agora))
            c.repassadas, c.vagas_sem_fila = _repassar_liberadas(db, agora, cfg.motor_max_repasses_por_ciclo)
            if c.mudou_algo:
                db.add(Evento(ocorrido_em=agora, tipo="motor_ciclo", ator=ATOR,
                              payload={k: v for k, v in c.dict().items() if k != "em" and v not in (None, 0, False)}))
            db.commit()
    except Exception as e:                           # noqa: BLE001 — o motor nunca derruba a API
        db.rollback()
        c.erro = f"{type(e).__name__}: {e}"
        log.exception("ciclo do motor falhou")
    finally:
        ESTADO.executando = False
    c.duracao_ms = int((time.perf_counter() - t0) * 1000)
    ESTADO.registrar(c)
    if c.mudou_algo:
        log.info("motor: rodada=%s convocações=%s expiradas=%s repassadas=%s em %sms",
                 c.rodada_id if c.rodada_criada else "—", c.convocacoes_criadas, c.expiradas, c.repassadas,
                 c.duracao_ms)
    return c


def ciclo_com_sessao(agora: datetime | None = None) -> Ciclo:
    """Ciclo em sessão própria — usado pela rotina de fundo e pelo POST /motor/ciclo."""
    from app.db import get_sessionmaker

    db = get_sessionmaker()()
    try:
        return executar_ciclo(db, agora)
    finally:
        db.close()


async def rodar() -> None:
    """Rotina de fundo: um ciclo a cada `MOTOR_INTERVALO_SEGUNDOS`, para sempre."""
    cfg = get_settings()
    ESTADO.ligado = True
    ESTADO.intervalo_s = cfg.motor_intervalo_segundos
    ESTADO.expira_vencidas = cfg.motor_expirar_vencidas
    ESTADO.iniciado_em = datetime.now(timezone.utc)
    ESTADO.proxima_execucao = ESTADO.iniciado_em + timedelta(seconds=cfg.motor_atraso_inicial_segundos)
    try:
        await asyncio.sleep(cfg.motor_atraso_inicial_segundos)   # deixa o banco subir
        while True:
            await asyncio.to_thread(ciclo_com_sessao)
            ESTADO.proxima_execucao = datetime.now(timezone.utc) + timedelta(seconds=cfg.motor_intervalo_segundos)
            await asyncio.sleep(cfg.motor_intervalo_segundos)
    finally:
        ESTADO.ligado = False
        ESTADO.proxima_execucao = None
