"""Assistente (app/agente) sem rede e sem Postgres: cliente falso que devolve `tool_use` e depois texto.

Cobre: o laço de tool use (resultados numa só mensagem, erro vira is_error, limite de ferramentas, recusa),
o filtro de CRE aplicado no servidor (SQLite em memória com duas CREs), a validação da consulta_sql,
o log de acesso (consulta_agente) e a rota (503 sem chave, 422 sem CRE, 200 com o cliente falso).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.agente import ferramentas as fer
from app.agente import sql as sql_livre
from app.agente.escopo import Escopo, ForaDoEscopo
from app.agente.loop import ErroModelo, conversar
from app.agente.servico import preparar_historico, responder
from app.models import (Alocacao, Base, Capacidade, ConsultaAgente, Convocacao, Evento, Inscricao, Opcao, Pergunta,
                        Processo, Resposta, Rodada, Unidade)


# ----------------------------------------------------------------------------- cliente falso

def texto(t, **usage):
    return SimpleNamespace(type="text", text=t, **usage)


def uso_de_ferramenta(nome, entrada, id_="toolu_1"):
    return SimpleNamespace(type="tool_use", id=id_, name=nome, input=entrada)


def resposta(blocos, parada="end_turn", modelo="claude-falso"):
    return SimpleNamespace(content=blocos, stop_reason=parada, model=modelo,
                           usage=SimpleNamespace(input_tokens=100, output_tokens=20))


class ChamadorFalso:
    """Devolve as respostas na ordem; guarda os `params` de cada chamada para inspeção."""

    def __init__(self, *respostas):
        self.respostas = list(respostas)
        self.chamadas: list[dict] = []

    def __call__(self, params):
        self.chamadas.append(params)
        if not self.respostas:
            raise AssertionError("o cliente falso recebeu mais chamadas do que o previsto")
        r = self.respostas.pop(0)
        return r(params) if callable(r) else r


# ----------------------------------------------------------------------------- laço

def test_loop_tool_use_depois_texto():
    chamar = ChamadorFalso(
        resposta([texto("vou olhar"), uso_de_ferramenta("resumo_painel", {"cre": "4"})], "tool_use"),
        resposta([texto("São 12 vagas em risco.")]),
    )
    vistos = []

    def executar(nome, args):
        vistos.append((nome, args))
        return {"vagas_em_risco": 12}, "resumo do painel · 4ª CRE", None

    t = conversar(chamar, modelo="m", system="s", definicoes=[{"name": "resumo_painel"}], mensagens=[{"role": "user", "content": "?"}],
                  executar=executar, max_ferramentas=3)
    assert t.resposta == "São 12 vagas em risco."
    assert vistos == [("resumo_painel", {"cre": "4"})]
    assert [f.nome for f in t.ferramentas] == ["resumo_painel"] and t.ferramentas[0].resumo == "resumo do painel · 4ª CRE"
    assert t.tokens_entrada == 200 and t.tokens_saida == 40 and t.iteracoes == 2 and t.modelo == "claude-falso"
    # a 2ª chamada leva o bloco do assistente e o tool_result numa única mensagem de usuário
    msgs = chamar.chamadas[1]["messages"]
    assert msgs[1]["role"] == "assistant" and msgs[2]["role"] == "user"
    tr = msgs[2]["content"][0]
    assert tr["type"] == "tool_result" and tr["tool_use_id"] == "toolu_1" and tr["is_error"] is False
    assert '"vagas_em_risco": 12' in tr["content"]
    assert chamar.chamadas[0]["thinking"] == {"type": "adaptive"} and "tool_choice" not in chamar.chamadas[0]


def test_loop_erro_de_ferramenta_vira_is_error_e_nao_derruba():
    chamar = ChamadorFalso(
        resposta([uso_de_ferramenta("detalhe_convocacao", {"id": 1}, "a"), uso_de_ferramenta("regua", {}, "b")], "tool_use"),
        resposta([texto("A convocação 1 não é da sua CRE; a régua tem 13 perguntas.")]),
    )

    def executar(nome, args):
        if nome == "detalhe_convocacao":
            return {"erro": "a convocação 1 não pertence à 4ª CRE"}, "detalhe_convocacao (fora do escopo)", "a convocação 1 não pertence à 4ª CRE"
        return {"perguntas": 13}, "régua · 2025", None

    t = conversar(chamar, modelo="m", system="s", definicoes=[{"name": "x"}], mensagens=[{"role": "user", "content": "?"}], executar=executar)
    resultados = chamar.chamadas[1]["messages"][2]["content"]
    assert [r["tool_use_id"] for r in resultados] == ["a", "b"]           # os dois resultados na mesma mensagem
    assert resultados[0]["is_error"] is True and resultados[1]["is_error"] is False
    assert t.ferramentas[0].erro and t.ferramentas[1].erro is None
    assert "13 perguntas" in t.resposta


def test_loop_limite_de_ferramentas_fecha_com_tool_choice_none():
    def sempre_ferramenta(params):
        if params.get("tool_choice") == {"type": "none"}:
            return resposta([texto("Com o que tenho: ...")])
        return resposta([uso_de_ferramenta("rodadas", {})], "tool_use")

    chamar = ChamadorFalso(*([sempre_ferramenta] * 10))
    t = conversar(chamar, modelo="m", system="s", definicoes=[{"name": "rodadas"}], mensagens=[{"role": "user", "content": "?"}],
                  executar=lambda n, a: ({"ok": 1}, "rodadas", None), max_ferramentas=2)
    assert len(t.ferramentas) == 2 and t.resposta.startswith("Com o que tenho")
    assert len(chamar.chamadas) == 3 and chamar.chamadas[2]["tool_choice"] == {"type": "none"}


def test_loop_recusa_e_resposta_cortada():
    t = conversar(ChamadorFalso(resposta([], "refusal")), modelo="m", system="s", definicoes=[], mensagens=[{"role": "user", "content": "?"}],
                  executar=lambda n, a: (None, "", None))
    assert t.parada == "refusal" and "Não posso" in t.resposta
    t = conversar(ChamadorFalso(resposta([texto("meio")], "max_tokens")), modelo="m", system="s", definicoes=[],
                  mensagens=[{"role": "user", "content": "?"}], executar=lambda n, a: (None, "", None))
    assert t.resposta.startswith("meio") and "cortada" in t.resposta


def test_loop_nunca_termina_levanta_erro_modelo():
    chamar = ChamadorFalso(*([resposta([uso_de_ferramenta("rodadas", {})], "tool_use")] * 10))
    with pytest.raises(ErroModelo):
        conversar(chamar, modelo="m", system="s", definicoes=[{"name": "rodadas"}], mensagens=[{"role": "user", "content": "?"}],
                  executar=lambda n, a: ({"ok": 1}, "rodadas", None), max_ferramentas=2)


def test_preparar_historico():
    h = preparar_historico([{"role": "assistant", "content": "oi"}, {"role": "user", "content": " a "},
                            {"role": "assistant", "content": "b"}, {"role": "user", "content": "c"},
                            {"role": "assistant", "content": "fim"}], maximo=2)
    assert h == [{"role": "user", "content": "c"}]
    with pytest.raises(ValueError):
        preparar_historico([{"role": "assistant", "content": "só eu"}], maximo=10)


# ----------------------------------------------------------------------------- escopo

def test_escopo_cre_forca_a_propria_cre():
    e = Escopo("cre", "4")
    assert e.cre_efetiva(None) == "4" and e.cre_efetiva("4") == "4" and e.cre_efetiva(4) == "4"
    with pytest.raises(ForaDoEscopo):
        e.cre_efetiva("5")
    with pytest.raises(ForaDoEscopo):
        e.exigir_cre("5", "a unidade X")
    with pytest.raises(ForaDoEscopo):
        e.exigir_cre(None, "a unidade sem CRE")
    e.exigir_alguma_cre({"3", "4"}, "a inscrição 1")
    with pytest.raises(ForaDoEscopo):
        e.exigir_alguma_cre({"3"}, "a inscrição 2")
    s = Escopo("sme")
    assert s.cre_efetiva(None) is None and s.cre_efetiva("5") == "5"
    s.exigir_cre("5", "x")   # não restringe


def test_catalogo_por_area():
    assert "consulta_sql" not in fer.catalogo(Escopo("cre", "4"))
    assert "consulta_sql" in fer.catalogo(Escopo("sme"))
    d = fer.FERRAMENTAS[0].definicao()
    assert d["input_schema"]["additionalProperties"] is False and d["name"] == "resumo_painel"


# ----------------------------------------------------------------------------- banco SQLite com duas CREs

@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}, future=True)
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, expire_on_commit=False)()
    agora = datetime.now(timezone.utc)
    S.add(Processo(ano=2025, prm_id=195, descricao="teste"))
    S.add_all([Pergunta(ano=2025, ich_perg_id=1, perg_id=1, texto="CadÚnico", pontuacao=51, criterio_desempate=False, ordem=1)])
    S.add_all([Unidade(codigo="U1", nome="EDI UM", cre="4", bairro="PENHA"), Unidade(codigo="U2", nome="EDI DOIS", cre="4", bairro="MARÉ"),
               Unidade(codigo="U3", nome="EDI TRÊS", cre="5", bairro="TIJUCA")])
    S.add_all([Inscricao(id=1, ano=2025, prm_id=195, plm_id=1, ipl_id=1, aluno_anon="aluno_0000001", pontuacao=51, data_criacao=agora),
               Inscricao(id=2, ano=2025, prm_id=195, plm_id=1, ipl_id=2, aluno_anon="aluno_0000002", pontuacao=0, data_criacao=agora)])
    S.add_all([Opcao(id=1, inscricao_id=1, ordem=1, unidade_codigo="U1", grupamento="Berçário", horario="Integral"),
               Opcao(id=2, inscricao_id=1, ordem=2, unidade_codigo="U3", grupamento="Berçário", horario="Integral"),
               Opcao(id=3, inscricao_id=2, ordem=1, unidade_codigo="U3", grupamento="Berçário", horario="Integral")])
    S.add_all([Resposta(inscricao_id=1, ich_perg_id=1, resposta=True), Resposta(inscricao_id=2, ich_perg_id=1, resposta=False)])
    S.add_all([Capacidade(ano=2025, unidade_codigo=u, grupamento="Berçário", horario="Integral", vagas=2, fonte="estimada_confirmados")
               for u in ("U1", "U2", "U3")])
    S.add(Rodada(id=1, ano=2025, tipo="inicial", parametros={"vagas_presas": 3}, resumo={"n_inscricoes": 2}))
    S.add_all([Alocacao(id=1, rodada_id=1, inscricao_id=1, opcao_id=1, unidade_codigo="U1", grupamento="Berçário", horario="Integral",
                        status="alocada", tipo="presa", posicao_fila=1, pontuacao=51,
                        motivo={"propostas": [{"unidade": "U1", "ordem": 1, "resultado": "aceita", "vagas": 2}], "final": {"unidade": "U1", "ordem": 1, "posicao": 1, "tipo": "presa"}}),
               Alocacao(id=2, rodada_id=1, inscricao_id=2, opcao_id=3, unidade_codigo="U3", grupamento="Berçário", horario="Integral",
                        status="alocada", tipo="presa", posicao_fila=1, pontuacao=0, motivo={"propostas": [], "final": {"unidade": "U3", "ordem": 1, "posicao": 1, "tipo": "presa"}})])
    S.add_all([Convocacao(id=1, alocacao_id=1, inscricao_id=1, unidade_codigo="U1", grupamento="Berçário", horario="Integral",
                          status="selecionada", prazo_fim=agora - timedelta(hours=5), criada_em=agora - timedelta(days=4), atualizada_em=agora - timedelta(days=4)),
               Convocacao(id=2, alocacao_id=2, inscricao_id=2, unidade_codigo="U3", grupamento="Berçário", horario="Integral",
                          status="selecionada", prazo_fim=agora + timedelta(hours=5), criada_em=agora, atualizada_em=agora)])
    S.add_all([Evento(id=1, tipo="selecionada", convocacao_id=1, inscricao_id=1, unidade_codigo="U1", ator="sistema"),
               Evento(id=2, tipo="selecionada", convocacao_id=2, inscricao_id=2, unidade_codigo="U3", ator="sistema")])
    S.commit()
    yield S
    S.close()


CRE4 = Escopo("cre", "4", "polo-4")
SME = Escopo("sme")


def test_ferramentas_da_cre_nao_devolvem_outra_cre(db):
    r = fer.executar(db, CRE4, "buscar_unidades", {"q": "EDI"})
    assert {u["codigo"] for u in r.dados["unidades"]} == {"U1", "U2"}
    assert "erro" in fer.executar(db, CRE4, "buscar_unidades", {"cre": "5"}).dados
    r = fer.executar(db, CRE4, "listar_convocacoes", {})
    assert r.dados["total"] == 1 and r.dados["itens"][0]["id"] == 1 and "aluno_anon" not in r.dados["itens"][0]
    assert r.dados["por_status"] == {"selecionada": 1} and "4ª CRE" in r.resumo
    r = fer.executar(db, CRE4, "listar_convocacoes", {"prazo": "vencido", "incluir_codigos": True})
    assert r.dados["total"] == 1 and r.dados["itens"][0]["atrasada"] is True and r.dados["itens"][0]["aluno_anon"] == "aluno_0000001"
    assert fer.executar(db, CRE4, "listar_convocacoes", {"unidade": "U3"}).dados["erro"].startswith("a unidade U3 não pertence")
    assert "erro" in fer.executar(db, CRE4, "listar_convocacoes", {"cre": "5"}).dados
    assert fer.executar(db, CRE4, "detalhe_convocacao", {"id": 1}).dados["unidade_nome"] == "EDI UM"
    assert "não pertence à 4ª CRE" in fer.executar(db, CRE4, "detalhe_convocacao", {"id": 2}).dados["erro"]
    assert "não encontrada" in fer.executar(db, CRE4, "detalhe_convocacao", {"id": 99}).dados["erro"]
    # inscrição 1 tem uma opção na 4ª (basta uma); a 2 só tem a 5ª
    r = fer.executar(db, CRE4, "ficha_inscricao", {"codigo": "aluno_0000001"})
    assert r.dados["inscricao"]["id"] == 1 and r.dados["situacao_resumo"] == "reservas_abertas"
    assert "4ª CRE" in fer.executar(db, CRE4, "ficha_inscricao", {"codigo": "2"}).dados["erro"]
    assert "4ª CRE" in fer.executar(db, CRE4, "explicacao_resultado", {"rodada_id": 1, "inscricao_id": 2}).dados["erro"]
    assert "ponto(s)" in fer.executar(db, CRE4, "explicacao_resultado", {"rodada_id": 1, "inscricao_id": 1}).dados["texto"]
    assert "não pertence" in fer.executar(db, CRE4, "capacidade_unidade", {"codigo": "U3"}).dados["erro"]
    assert "indisponível" in fer.executar(db, CRE4, "consulta_sql", {"sql": "select 1"}).dados["erro"]


def test_sme_ve_a_rede_inteira(db):
    r = fer.executar(db, SME, "listar_convocacoes", {})
    assert r.dados["total"] == 2 and "rede" in r.resumo
    assert fer.executar(db, SME, "listar_convocacoes", {"cre": "5"}).dados["total"] == 1
    assert fer.executar(db, SME, "detalhe_convocacao", {"id": 2}).dados["cre"] == "5"
    assert {u["codigo"] for u in fer.executar(db, SME, "buscar_unidades", {}).dados["unidades"]} == {"U1", "U2", "U3"}
    r = fer.executar(db, SME, "rodadas", {})
    assert r.dados[0]["id"] == 1 and r.dados[0]["parametros"] == {"vagas_presas": 3}
    assert fer.executar(db, SME, "regua", {}).dados["perguntas"][0]["pontuacao"] == 51


def test_resumo_painel_forca_a_cre_no_servidor(db, monkeypatch):
    recebido = {}

    def falso_resumo(cre=None, unidade=None, db=None):
        recebido["cre"], recebido["unidade"] = cre, unidade
        return {"ok": True}

    monkeypatch.setattr(fer.painel, "resumo", falso_resumo)
    assert fer.executar(db, CRE4, "resumo_painel", {}).dados == {"ok": True} and recebido["cre"] == "4"
    assert "erro" in fer.executar(db, CRE4, "resumo_painel", {"cre": "5"}).dados
    assert "erro" in fer.executar(db, CRE4, "resumo_painel", {"unidade": "U3"}).dados
    fer.executar(db, SME, "resumo_painel", {"cre": "7"})
    assert recebido["cre"] == "7"
    fer.executar(db, SME, "resumo_painel", {})
    assert recebido["cre"] is None


def test_ferramenta_que_estoura_vira_erro_e_sessao_continua_usavel(db, monkeypatch):
    def explode(*a, **k):
        raise RuntimeError("boom")

    monkeypatch.setattr(fer.painel, "unidades", explode)
    r = fer.executar(db, CRE4, "painel_unidades", {})
    assert r.dados["erro"].startswith("falha ao consultar o banco") and "falhou" in r.resumo
    assert fer.executar(db, CRE4, "buscar_unidades", {}).dados["n"] == 2
    assert "desconhecida" in fer.executar(db, CRE4, "nao_existe", {}).dados["erro"]


# ----------------------------------------------------------------------------- consulta_sql

@pytest.mark.parametrize("sql", [
    "select count(*) from convocacao",
    "SELECT u.cre, count(*) FROM convocacao c JOIN unidade u ON u.codigo = c.unidade_codigo GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
    "with x as (select 1 as a) select a from x",
    "select nome from unidade where nome ilike '%EDI DO POVO%'",     # DO dentro de literal não bloqueia
])
def test_consulta_sql_aceita_select(sql):
    assert sql_livre.validar(sql) == sql.strip()
    assert sql_livre.embrulhar(sql, 200).endswith("LIMIT 200")


@pytest.mark.parametrize("sql,motivo", [
    ("select 1; drop table evento", "ponto e vírgula"),
    ("delete from evento", "SELECT ou WITH"),
    ("select 1 -- x", "comentários"),
    ("select /* x */ 1", "comentários"),
    ("with d as (delete from evento returning *) select * from d", "DELETE"),
    ("select * from pg_stat_activity", "PG_"),
    ("select pg_sleep(5)", "PG_SLEEP"),
    ("select * from information_schema.tables", "INFORMATION_SCHEMA"),
    ("select 1 into novo", "INTO"),
    ("select set_config('x','y',false)", "SET_CONFIG"),
    ("select current_user", "CURRENT_USER"),
    ("select $$x$$", "não permitidos"),
    ("", "vazia"),
    ("select " + "1," * 3000 + "1", "maior"),
])
def test_consulta_sql_rejeita(sql, motivo):
    with pytest.raises(sql_livre.SqlRejeitado) as e:
        sql_livre.validar(sql)
    assert motivo.lower() in str(e.value).lower()


def test_consulta_sql_executa_com_limite(db):
    r = sql_livre.executar(db.get_bind(), "select codigo from unidade order by codigo", limite=2)
    assert r["colunas"] == ["codigo"] and r["linhas"] == [["U1"], ["U2"]] and r["cortado_em"] == 2
    r = fer.executar(db, SME, "consulta_sql", {"sql": "select count(*) as n from convocacao", "motivo": "total"})
    assert r.dados["linhas"] == [[2]] and "total" in r.resumo
    assert "rejeitada" in fer.executar(db, SME, "consulta_sql", {"sql": "update unidade set cre='1'"}).dados["erro"]
    assert db.scalar(select(Unidade.cre).where(Unidade.codigo == "U1")) == "4"


# ----------------------------------------------------------------------------- serviço + log de acesso

def test_servico_responde_e_grava_log(db):
    chamar = ChamadorFalso(
        resposta([uso_de_ferramenta("listar_convocacoes", {"cre": "5", "prazo": "vencido"}, "a"),
                  uso_de_ferramenta("listar_convocacoes", {"prazo": "vencido"}, "b")], "tool_use"),
        resposta([texto("Uma convocação vencida na 4ª CRE.")]),
    )
    turno, log_id = responder(db, CRE4, [{"role": "user", "content": "quais venceram?"}], chamar)
    assert turno.resposta.startswith("Uma convocação") and log_id is not None
    assert turno.ferramentas[0].erro and turno.ferramentas[1].erro is None
    # o prompt de sistema carrega as regras e o escopo
    system = chamar.chamadas[0]["system"]
    assert "Resolução SME 542/2025" in system[0]["text"] and "4ª CRE" in system[0]["text"] and system[0]["cache_control"]
    assert "CRE: 4ª" in system[1]["text"]
    assert {t["name"] for t in chamar.chamadas[0]["tools"]} == set(fer.catalogo(CRE4))
    linha = db.get(ConsultaAgente, log_id)
    assert linha.area == "cre" and linha.cre == "4" and linha.ator == "polo-4" and linha.modelo == "claude-falso"
    assert len(linha.pergunta_hash) == 64 and linha.pergunta_chars == len("quais venceram?")
    assert [f["nome"] for f in linha.ferramentas] == ["listar_convocacoes", "listar_convocacoes"]
    assert linha.ferramentas[0]["erro"] and "erro" not in linha.ferramentas[1]
    assert linha.tokens_entrada == 200 and linha.resultado == "ok"


def test_servico_grava_log_mesmo_quando_o_modelo_falha(db):
    def falha(params):
        raise ErroModelo(429, "muitas perguntas")

    with pytest.raises(ErroModelo):
        responder(db, SME, [{"role": "user", "content": "x"}], falha)
    linha = db.scalars(select(ConsultaAgente)).one()
    assert linha.resultado == "erro" and linha.area == "sme" and linha.ferramentas == []


# ----------------------------------------------------------------------------- rota

@pytest.fixture
def cliente(db, monkeypatch):
    from fastapi.testclient import TestClient
    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app), monkeypatch
    app.dependency_overrides.clear()


def test_rota_503_sem_chave(cliente):
    from app.agente.cliente import AssistenteIndisponivel
    from app.routers import chat
    c, mp = cliente

    def sem_chave():
        raise AssistenteIndisponivel("assistente indisponível: configure ANTHROPIC_API_KEY no ambiente do backend")

    mp.setattr(chat, "chamador", sem_chave)
    r = c.post("/api/v1/chat", json={"area": "cre", "cre": "4", "mensagens": [{"role": "user", "content": "oi"}]})
    assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_rota_responde_com_cliente_falso(cliente):
    from app.routers import chat
    c, mp = cliente
    chamar = ChamadorFalso(
        resposta([uso_de_ferramenta("buscar_unidades", {"q": "EDI"})], "tool_use"),
        resposta([texto("Duas unidades: EDI UM e EDI DOIS.")]),
    )
    mp.setattr(chat, "chamador", lambda: chamar)
    r = c.post("/api/v1/chat", json={"area": "cre", "mensagens": [{"role": "user", "content": "unidades?"}]})
    assert r.status_code == 422                                      # CRE obrigatória na área cre
    r = c.post("/api/v1/chat", json={"area": "cre", "cre": "4", "ator": "polo-4",
                                     "mensagens": [{"role": "user", "content": "unidades?"}]})
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["resposta"].startswith("Duas unidades") and corpo["modelo"] == "claude-falso" and corpo["log_id"]
    assert corpo["ferramentas"] == [{"nome": "buscar_unidades", "argumentos": {"q": "EDI"},
                                     "resumo": "busca de unidades · 4ª CRE · “EDI” · 2 encontradas", "erro": None}]
    r = c.post("/api/v1/chat", json={"area": "sme", "mensagens": [{"role": "assistant", "content": "só eu"}]})
    assert r.status_code == 422


# ----------------------------------------------------------------------------- seções do painel ("me leva até lá")

def test_secoes_no_prompt_por_area():
    from app.agente import prompts, secoes
    cre = prompts.sistema(CRE4)[0]["text"]
    sme = prompts.sistema(SME)[0]["text"]
    assert "apontar_no_painel" in cre and "`cre.para_hoje`" in cre and "`sme.tabela_cre`" not in cre
    assert "`sme.tabela_cre`" in sme and "`cre.para_hoje`" not in sme
    assert {s.area for s in secoes.SECOES} == {"cre", "sme"}
    assert len({s.id for s in secoes.SECOES}) == len(secoes.SECOES)
    assert "apontar_no_painel" in fer.catalogo(CRE4) and "apontar_no_painel" in fer.catalogo(SME)


def test_apontar_no_painel_valida_secao_fila_e_unidade(db):
    r = fer.executar(db, CRE4, "apontar_no_painel", {"secao": "cre.para_hoje", "resumo": "1 vencida."})
    assert r.dados["ok"] and r.dados["rota"] == "/cre" and r.dados["titulo"] == "Para hoje"
    assert r.resumo == "Para hoje · Painel da CRE"
    r = fer.executar(db, CRE4, "apontar_no_painel", {"secao": "cre.convocacoes", "fila": "vencidas", "unidade": "U1", "resumo": "x"})
    assert r.dados["rota"] == "/cre/convocacoes?fila=vencidas&unidade=U1"
    r = fer.executar(db, CRE4, "apontar_no_painel", {"secao": "cre.unidade_fila", "unidade": "U2", "resumo": "x"})
    assert r.dados["rota"] == "/cre/unidades/U2"
    # seção de outra área, fila inválida, unidade de outra CRE, sem resumo, sem unidade: erro para o modelo, sem exceção
    erro = lambda esc, args: fer.executar(db, esc, "apontar_no_painel", args).dados["erro"]  # noqa: E731
    assert "seção desconhecida" in erro(CRE4, {"secao": "sme.tabela_cre", "resumo": "x"})
    assert "fila desconhecida" in erro(CRE4, {"secao": "cre.convocacoes", "fila": "atrasadas", "resumo": "x"})
    assert "não pertence" in erro(CRE4, {"secao": "cre.unidade_fila", "unidade": "U3", "resumo": "x"})
    assert "resumo" in erro(CRE4, {"secao": "cre.para_hoje"})
    assert "precisa do código" in erro(CRE4, {"secao": "cre.unidade_fila", "resumo": "x"})
    assert "não aceita fila" in erro(SME, {"secao": "sme.tabela_cre", "fila": "vencidas", "resumo": "x"})
    assert "não encontrada" in erro(SME, {"secao": "sme.unidade_capacidade", "unidade": "U9", "resumo": "x"})


def test_rota_devolve_navegacao_quando_o_modelo_aponta(cliente):
    from app.routers import chat
    c, mp = cliente
    chamar = ChamadorFalso(
        resposta([uso_de_ferramenta("buscar_unidades", {"q": "EDI"}, "a")], "tool_use"),
        resposta([uso_de_ferramenta("apontar_no_painel", {"secao": "cre.para_hoje", "resumo": "Há 1 convocação vencida na 4ª CRE."}, "b")],
                 "tool_use"),
        resposta([texto("Isso já está no painel, no card Para hoje. Quer que eu te leve até lá?")]),
    )
    mp.setattr(chat, "chamador", lambda: chamar)
    r = c.post("/api/v1/chat", json={"area": "cre", "cre": "4", "mensagens": [{"role": "user", "content": "quantas venceram?"}]})
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["navegacao"] == {"secao": "cre.para_hoje", "pagina": "Painel da CRE", "titulo": "Para hoje", "rota": "/cre",
                                  "resumo": "Há 1 convocação vencida na 4ª CRE."}
    assert [f["nome"] for f in corpo["ferramentas"]] == ["buscar_unidades", "apontar_no_painel"]
    # a ferramenta devolve ao modelo a instrução de perguntar, e o resultado não é erro
    assert chamar.chamadas[2]["messages"][-1]["content"][0]["is_error"] is False

    # o modelo apontou uma seção de outra área → erro na ferramenta, sem navegação, resposta normal
    chamar2 = ChamadorFalso(
        resposta([uso_de_ferramenta("apontar_no_painel", {"secao": "sme.tabela_cre", "resumo": "x"}, "c")], "tool_use"),
        resposta([texto("Na 4ª CRE há 1 vencida.")]),
    )
    mp.setattr(chat, "chamador", lambda: chamar2)
    r = c.post("/api/v1/chat", json={"area": "cre", "cre": "4", "mensagens": [{"role": "user", "content": "quantas venceram?"}]})
    assert r.status_code == 200 and r.json()["navegacao"] is None and r.json()["ferramentas"][0]["erro"]
