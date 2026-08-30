"""Visão da FAMÍLIA: uma inscrição, em linguagem de responsável, e a resposta às vagas reservadas.

Sem login nesta fase: o código é o `aluno_anon` da base anonimizada (ou o id da inscrição). Em produção
o acesso é pelo CPF do responsável validado no gov.br / matricula.rio.
"""
from __future__ import annotations

from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Alocacao, Comprovacao, Convocacao, Inscricao, Opcao, Pergunta, Resposta, Rodada, Unidade
from app.routers.classificacao import _texto_explicacao
from app.routers.convocacoes import ABERTAS, _agora, registrar_evento
from app.schemas import (
    ComprovacaoOut,
    EventoIn,
    EventoRegistrado,
    FamiliaConvocacao,
    FamiliaCriterio,
    FamiliaInscricao,
    FamiliaOpcao,
    FamiliaPontuacao,
    FamiliaResposta,
    FamiliaVisao,
    RodadaRef,
)

router = APIRouter(prefix="/familia", tags=["familia"])

# critério da régua → critério do provedor de comprovação
CRITERIO_COMPROVACAO = {
    "cadúnico": "cadunico", "cadunico": "cadunico", "cadastro único": "cadunico",
    "bolsa família": "bolsa_familia", "bolsa familia": "bolsa_familia", "cartão carioca": "bolsa_familia",
    "educação especial": "educacao_especial",
}
# critérios com verificação automática: fonte e se a resposta da API substitui a declaração da família
AUTOMATICOS = {
    "cadunico": ("conecta_cadunico", True),
    "bolsa_familia": ("conecta_bolsa_familia", True),
    "educacao_especial": ("rmi", False),   # RMI só dá indício; laudo continua valendo → família pode marcar
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
            prazo = prazo.replace(tzinfo=UTC)
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


# ----------------------------------------------------------------------------- pré-cadastro (jul–ago)

import hashlib
import os
import secrets

from app import geo as _geo
from app.engine.scoring import ItemRegua, pontuar
from app.models import Contato, PreCadastro
from app.routers.geo import centroide_bairro_factory
from app.schemas import (
    CasaOut,
    ContatoOut,
    CriterioVerificado,
    EscolhaOut,
    PontuacaoEstimada,
    PontuacaoItem,
    PreCadastroCriado,
    PreCadastroIn,
    PreCadastroOut,
    ReguaFamilia,
    ReguaPergunta,
    SugestoesIn,
    SugestoesOut,
    UnidadeSugerida,
    VerificacaoOut,
    VerificarIn,
)

RAIO_KM = 5.0
N_SUGESTOES = 15
CHANCE_ORDEM = {"alta": 0, "media": 1, "baixa": 2, "sem_vaga": 3}


def _ano_regua(db: Session, ano: int | None) -> int:
    from app.models import Processo
    return ano or db.execute(select(func.max(Processo.ano))).scalar()


def _regua(db: Session, ano: int) -> list[Pergunta]:
    return db.scalars(select(Pergunta).where(Pergunta.ano == ano).order_by(Pergunta.ordem, Pergunta.ich_perg_id)).all()


@router.get("/regua", response_model=ReguaFamilia)
def regua_familia(ano: int | None = None, db: Session = Depends(get_db)):
    """Critérios do questionário em linguagem de família, com os pontos de cada um (norma, só leitura)."""
    ano = _ano_regua(db, ano)
    itens = _regua(db, ano)
    return ReguaFamilia(ano=ano, maxima=sum(p.pontuacao for p in itens if p.pontuacao > 0 and not p.criterio_desempate),
                        perguntas=[ReguaPergunta(ich_perg_id=p.ich_perg_id, texto=p.texto, pontos=p.pontuacao,
                                                 desempate=p.criterio_desempate,
                                                 automatico=_criterio_comprovacao(p.texto) in AUTOMATICOS,
                                                 fonte_automatica=AUTOMATICOS.get(_criterio_comprovacao(p.texto) or "", (None,))[0])
                                   for p in itens if p.pontuacao > 0 or p.criterio_desempate])


def _pontuar(itens: list[Pergunta], respostas: dict[str, bool]) -> PontuacaoEstimada:
    regua = [ItemRegua(p.ich_perg_id, p.pontuacao, p.criterio_desempate, p.ordem or 0) for p in itens]
    resp = {int(k): bool(v) for k, v in respostas.items() if str(k).lstrip("-").isdigit()}
    pt = pontuar(resp, regua)
    texto = {p.ich_perg_id: p.texto for p in itens}
    return PontuacaoEstimada(total=pt.total,
                             maxima=sum(p.pontuacao for p in itens if p.pontuacao > 0 and not p.criterio_desempate),
                             itens=[PontuacaoItem(ich_perg_id=i, texto=texto.get(i, ""), pontos=pts) for i, pts in pt.itens])


def _chance(taxa_pct: float | None, vagas: int) -> str:
    """Chance = % das crianças com até a pontuação da família que escolheram a unidade e conseguiram vaga."""
    if vagas <= 0:
        return "sem_vaga"
    if taxa_pct is None:
        return "media"
    if taxa_pct >= 50:
        return "alta"
    if taxa_pct >= 25:
        return "media"
    return "baixa"


def _sugerir(db: Session, ano: int, grupamento: str, horario: str, pontuacao: int,
             lat: float, lon: float) -> list[UnidadeSugerida]:
    """Unidades com capacidade no grupamento/turno, ordenadas por chance e distância.
    `taxa_pct` = % das crianças com pontuação ≤ a da família que escolheram a unidade (mesmo grupamento/turno,
    ano da régua) e conseguiram vaga — desfecho real da SME. `corte` = menor pontuação confirmada (referência)."""
    linhas = db.execute(text("""
        WITH hist AS (
          SELECT o.unidade_codigo,
                 MIN(i.pontuacao) FILTER (WHERE o.situacao_origem = 'Confirmado') AS corte,
                 COUNT(*) FILTER (WHERE i.pontuacao <= :p) AS n_iguais,
                 COUNT(*) FILTER (WHERE i.pontuacao <= :p AND o.situacao_origem = 'Confirmado') AS k_iguais
          FROM opcao o JOIN inscricao i ON i.id = o.inscricao_id
          WHERE i.ano = :ano AND o.grupamento = :g AND o.horario = :h
          GROUP BY o.unidade_codigo
        )
        SELECT u.codigo, u.nome, u.bairro, u.lat, u.lon, COALESCE(c.vagas, 0) AS vagas, k.corte,
               k.n_iguais, k.k_iguais
        FROM unidade u
        LEFT JOIN capacidade c ON c.unidade_codigo = u.codigo AND c.ano = :ano AND c.grupamento = :g AND c.horario = :h
        LEFT JOIN hist k ON k.unidade_codigo = u.codigo
        WHERE u.lat IS NOT NULL AND u.lon IS NOT NULL
          AND u.lat BETWEEN :lat - 0.09 AND :lat + 0.09 AND u.lon BETWEEN :lon - 0.10 AND :lon + 0.10
    """), {"ano": ano, "g": grupamento, "h": horario, "lat": lat, "lon": lon, "p": pontuacao}).all()
    cands = []
    for r in linhas:
        d = _geo.haversine_km(lat, lon, float(r.lat), float(r.lon))
        cands.append((r, d))
    perto = [c for c in cands if c[1] <= RAIO_KM]
    if len(perto) < N_SUGESTOES:
        perto = sorted(cands, key=lambda c: c[1])[:max(N_SUGESTOES, len(perto))]
    out = []
    for r, d in perto:
        n, k = int(r.n_iguais or 0), int(r.k_iguais or 0)
        taxa = round(100.0 * k / n, 0) if n >= 5 else None      # menos de 5 casos: sem base para estimar
        ch = _chance(taxa, int(r.vagas))
        out.append(UnidadeSugerida(codigo=r.codigo, nome=r.nome, bairro=r.bairro, lat=float(r.lat), lon=float(r.lon),
                                   distancia_km=round(d, 2), vagas=int(r.vagas),
                                   corte=int(r.corte) if r.corte is not None else None,
                                   taxa_pct=taxa, n_base=n, chance=ch, ordem_sugerida=0))
    out.sort(key=lambda u: (CHANCE_ORDEM[u.chance], u.distancia_km))
    out = out[:N_SUGESTOES]
    for i, u in enumerate(out, start=1):
        u.ordem_sugerida = i
    return out


@router.post("/sugestoes", response_model=SugestoesOut)
def sugestoes(body: SugestoesIn, db: Session = Depends(get_db)):
    """Pontuação estimada + top 5 (e até 15 para o mapa) em tempo real, conforme a família preenche."""
    ano = _ano_regua(db, body.ano)
    itens = _regua(db, ano)
    pont = _pontuar(itens, body.respostas)
    casa = None
    lat, lon = body.lat, body.lon
    bairro, fonte = None, "informado"
    if (lat is None or lon is None) and body.cep:
        e = _geo.geocodificar(body.cep, centroide_bairro_factory(db))
        lat, lon, bairro, fonte = e.lat, e.lon, e.bairro, e.fonte
    unidades: list[UnidadeSugerida] = []
    if lat is not None and lon is not None:
        casa = CasaOut(lat=lat, lon=lon, bairro=bairro, fonte=fonte)
        unidades = _sugerir(db, ano, body.grupamento, body.horario, pont.total, lat, lon)
    return SugestoesOut(pontuacao=pont, regua_ano=ano, casa=casa, unidades=unidades)


def _cpf_hash(cpf: str) -> str:
    d = "".join(ch for ch in cpf if ch.isdigit())
    sal = os.environ.get("CPF_SAL", "inscricao-creche-dev")
    return hashlib.sha256(f"{sal}:{d}".encode()).hexdigest()


def _protocolo() -> str:
    return "PC-" + secrets.token_hex(4).upper()


@router.post("/pre-cadastro", response_model=PreCadastroCriado, status_code=201)
def criar_pre_cadastro(body: PreCadastroIn, db: Session = Depends(get_db)):
    if not body.consentimento:
        raise HTTPException(422, "É preciso aceitar o uso dos dados para a classificação de creche.")
    cpf = "".join(ch for ch in body.cpf if ch.isdigit())
    if len(cpf) != 11:
        raise HTTPException(422, "CPF deve ter 11 dígitos.")
    cep = _geo.normalizar_cep(body.cep)
    if not cep:
        raise HTTPException(422, "CEP deve ter 8 dígitos.")
    if len(set(body.escolhas)) != len(body.escolhas):
        raise HTTPException(422, "Há creche repetida nas escolhas.")
    if len(body.contatos) < 3:
        raise HTTPException(422, "Informe pelo menos 3 contatos (pessoas ou canais diferentes).")
    if len({(c.canal, c.valor.strip().lower()) for c in body.contatos}) < len(body.contatos):
        raise HTTPException(422, "Há contato repetido: cada linha precisa ser uma pessoa ou canal diferente.")
    existentes = {u for (u,) in db.execute(select(Unidade.codigo).where(Unidade.codigo.in_(body.escolhas))).all()}
    faltam = [c for c in body.escolhas if c not in existentes]
    if faltam:
        raise HTTPException(422, f"Creche desconhecida: {', '.join(faltam)}")
    if not any(c.principal for c in body.contatos):
        body.contatos[0].principal = True

    ano = _ano_regua(db, None)
    pont = _pontuar(_regua(db, ano), body.respostas)
    lat, lon, bairro = body.lat, body.lon, None
    e = _geo.geocodificar(cep, centroide_bairro_factory(db))
    bairro = e.bairro
    if lat is None or lon is None:
        lat, lon = e.lat, e.lon

    for _ in range(5):
        protocolo = _protocolo()
        if not db.scalar(select(PreCadastro.id).where(PreCadastro.protocolo == protocolo)):
            break
    pc = PreCadastro(protocolo=protocolo, cpf_hash=_cpf_hash(cpf), nome_responsavel=body.nome_responsavel.strip(),
                     nome_crianca=(body.nome_crianca or "").strip() or None, nascimento_anomes=body.nascimento_anomes,
                     grupamento=body.grupamento, horario=body.horario, cep=cep,
                     cep_alternativo=_geo.normalizar_cep(body.cep_alternativo) if body.cep_alternativo else None,
                     bairro=bairro, lat=lat, lon=lon, regua_ano=ano,
                     respostas={str(k): bool(v) for k, v in body.respostas.items()}, pontuacao=pont.total,
                     escolhas=[{"ordem": i, "codigo": c} for i, c in enumerate(body.escolhas, start=1)],
                     verificacoes=body.verificacoes, consentimento_em=_agora())
    for c in body.contatos:
        pc.contatos.append(Contato(nome=c.nome.strip(), parentesco=c.parentesco, canal=c.canal,
                                   valor=c.valor.strip(), principal=c.principal))
    db.add(pc)
    db.commit()
    db.refresh(pc)
    return PreCadastroCriado(id=pc.id, protocolo=pc.protocolo, pontuacao=pc.pontuacao, criado_em=pc.criado_em,
                             n_escolhas=len(body.escolhas), n_contatos=len(body.contatos))


@router.get("/pre-cadastro/{protocolo}", response_model=PreCadastroOut)
def ver_pre_cadastro(protocolo: str, db: Session = Depends(get_db)):
    pc = db.scalars(select(PreCadastro).where(PreCadastro.protocolo == protocolo.strip().upper())).first()
    if not pc:
        raise HTTPException(404, "Não encontramos um pré-cadastro com esse protocolo.")
    codigos = [e["codigo"] for e in pc.escolhas]
    unidades = {u.codigo: u for u in db.scalars(select(Unidade).where(Unidade.codigo.in_(codigos))).all()} if codigos else {}
    escolhas = []
    for e in pc.escolhas:
        u = unidades.get(e["codigo"])
        d = (_geo.haversine_km(pc.lat, pc.lon, u.lat, u.lon) if u and u.lat is not None and pc.lat is not None else None)
        escolhas.append(EscolhaOut(ordem=e["ordem"], codigo=e["codigo"], nome=u.nome if u else None,
                                   bairro=u.bairro if u else None, distancia_km=round(d, 2) if d is not None else None))
    return PreCadastroOut(protocolo=pc.protocolo, criado_em=pc.criado_em, nome_responsavel=pc.nome_responsavel,
                          nome_crianca=pc.nome_crianca, nascimento_anomes=pc.nascimento_anomes, grupamento=pc.grupamento,
                          horario=pc.horario, cep=pc.cep, bairro=pc.bairro, lat=pc.lat, lon=pc.lon, regua_ano=pc.regua_ano,
                          pontuacao=pc.pontuacao, respostas=pc.respostas, verificacoes=pc.verificacoes,
                          contatos=[ContatoOut(id=c.id, nome=c.nome, parentesco=c.parentesco, canal=c.canal, valor=c.valor,
                                               principal=c.principal, verificado_em=c.verificado_em) for c in pc.contatos],
                          escolhas=escolhas)


@router.post("/verificar", response_model=VerificacaoOut)
def verificar(body: VerificarIn, db: Session = Depends(get_db)):
    """Verificação automática pelo CPF (Conecta CadÚnico / Bolsa Família; RMI para indício de laudo).
    O CPF nunca sai daqui em claro: o provedor recebe só o hash (nesta fase os provedores são mock)."""
    from app.integracoes.base import DadosInscricao
    from app.integracoes.registry import provedores

    cpf = "".join(ch for ch in body.cpf if ch.isdigit())
    if len(cpf) != 11:
        raise HTTPException(422, "CPF deve ter 11 dígitos.")
    chave = _cpf_hash(cpf)[:16]
    ano = _ano_regua(db, None)
    itens = _regua(db, ano)
    por_criterio: dict[str, Pergunta] = {}
    for p in itens:
        c = _criterio_comprovacao(p.texto)
        if c and c in AUTOMATICOS:
            por_criterio.setdefault(c, p)
    dados = DadosInscricao(inscricao_id=0, ano=ano, aluno_anon=f"pc_{chave}", responsavel_anon=f"pc_{chave}",
                           nascimento_anomes=body.nascimento_anomes, cep=None)
    verificados, automaticas = [], {}
    for prov in provedores():
        if prov.criterio not in AUTOMATICOS:
            continue
        r = prov.consultar(dados)
        p = por_criterio.get(prov.criterio)
        fonte, bloqueia = AUTOMATICOS[prov.criterio]
        verificados.append(CriterioVerificado(criterio=r.criterio, fonte=r.fonte, resultado=r.resultado, protocolo=r.protocolo,
                                              ich_perg_id=p.ich_perg_id if p else None, texto=p.texto if p else None,
                                              pontos=p.pontuacao if p else 0,
                                              bloqueia_manual=bloqueia and r.resultado in ("confirmado", "nao_encontrado")))
        if p and r.resultado == "confirmado":
            automaticas[str(p.ich_perg_id)] = True
        elif p and r.resultado == "nao_encontrado" and bloqueia:
            automaticas[str(p.ich_perg_id)] = False
    return VerificacaoOut(verificados=verificados, respostas_automaticas=automaticas)
