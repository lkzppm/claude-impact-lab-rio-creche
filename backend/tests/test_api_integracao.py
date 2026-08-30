"""Teste de integração ponta a ponta contra o Postgres.

⚠️ Ele TRUNCA todas as tabelas. Por isso só roda quando `TEST_DATABASE_URL` está definido — nunca contra o
banco de desenvolvimento/demo por acidente. Ex.: TEST_DATABASE_URL=postgresql+psycopg://creche:creche@localhost:5432/creche_test

Cobre: rodada com 3 presas + 2 alternativas, rodada clássica (1 presa), convocações por vaga presa,
confirmação liberando as irmãs, transição inválida, painel, rematch, comprovação mock e trigger append-only.
"""
import random
from datetime import datetime, timedelta

import pytest
from sqlalchemy import text

from app.db import get_sessionmaker
from app.models import Capacidade, Inscricao, Opcao, Pergunta, Processo, Resposta, Unidade

import os

_URL = os.environ.get("TEST_DATABASE_URL")
if not _URL:
    pytest.skip("defina TEST_DATABASE_URL para rodar o teste de integração (ele trunca o banco)", allow_module_level=True)
os.environ["DATABASE_URL"] = _URL
try:
    _S = get_sessionmaker()()
    _S.execute(text("SELECT 1"))
except Exception:  # noqa: BLE001
    pytest.skip("Postgres de teste indisponível", allow_module_level=True)


@pytest.fixture(scope="module")
def cliente():
    from fastapi.testclient import TestClient
    from app.main import app
    S = _S
    for t in ["evento", "convocacao", "alocacao", "rodada", "comprovacao", "resposta", "opcao", "inscricao",
              "capacidade", "pergunta", "processo", "unidade"]:
        S.execute(text(f"TRUNCATE {t} CASCADE"))
    S.commit()
    S.add(Processo(ano=2025, prm_id=195, descricao="teste")); S.flush()
    S.add_all([Pergunta(ano=2025, ich_perg_id=1, perg_id=1, texto="CadÚnico", pontuacao=51, criterio_desempate=False, ordem=1),
               Pergunta(ano=2025, ich_perg_id=3, perg_id=3, texto="Irmão na rede", pontuacao=0, criterio_desempate=True, ordem=3)])
    U = [f"U{k}" for k in range(1, 7)]
    S.add_all([Unidade(codigo=u, nome=f"EDI {u}", cre=str((k % 2) + 1), bairro="Bangu") for k, u in enumerate(U)])
    S.flush()
    rnd = random.Random(1)
    for i in range(1, 41):
        x = Inscricao(ano=2025, prm_id=195, plm_id=1, ipl_id=i, aluno_anon=f"aluno_{i:07d}", responsavel_anon=f"resp_{i:07d}",
                      data_criacao=datetime(2025, 12, 9, 10, 0) + timedelta(minutes=i))
        S.add(x); S.flush()
        for o, u in enumerate(rnd.sample(U, rnd.randint(1, 5)), start=1):
            S.add(Opcao(inscricao_id=x.id, ordem=o, unidade_codigo=u, grupamento="Berçário", horario="Integral"))
        S.add(Resposta(inscricao_id=x.id, ich_perg_id=1, resposta=rnd.random() < 0.5))
        S.add(Resposta(inscricao_id=x.id, ich_perg_id=3, resposta=rnd.random() < 0.2))
    S.add_all([Capacidade(ano=2025, unidade_codigo=u, grupamento="Berçário", horario="Integral", vagas=4,
                          fonte="estimada_confirmados") for u in U])
    S.commit()
    return TestClient(app)


def test_fluxo_completo(cliente):
    c = cliente
    assert c.get("/api/v1/health").json()["db"] == "ok"
    rod = c.post("/api/v1/classificacao/rodadas", json={"ano": 2025, "vagas_presas": 3, "alternativas": 2}).json()
    assert rod["resumo"]["vagas_presas"] == 3 and 1 <= rod["resumo"]["media_presas_por_crianca"] <= 3
    r1 = c.post("/api/v1/classificacao/rodadas", json={"ano": 2025, "vagas_presas": 1}).json()
    assert r1["resumo"]["media_presas_por_crianca"] == 1.0
    al = c.get(f"/api/v1/classificacao/rodadas/{rod['id']}/alocacoes", params={"size": 5}).json()
    assert al["items"][0]["tipo"] == "presa" and al["items"][0]["unidade_nome"]
    iid = al["items"][0]["inscricao_id"]
    assert "ponto(s)" in c.get(f"/api/v1/classificacao/rodadas/{rod['id']}/explicacao/{iid}").json()["texto"]

    g = c.post("/api/v1/convocacoes/gerar", json={"rodada_id": rod['id']}).json()
    assert g["convocacoes_criadas"] > 0
    lst = c.get("/api/v1/convocacoes", params={"size": 200}).json()["items"]
    por = {}
    for i in lst:
        por.setdefault(i["inscricao_id"], []).append(i)
    minhas = next(v for v in por.values() if len(v) >= 2)
    cid = minhas[0]["id"]
    for tipo in ("tentativa_contato", "tentativa_contato", "contato_confirmado", "matricula_confirmada"):
        r = c.post(f"/api/v1/convocacoes/{cid}/eventos", json={"tipo": tipo, "payload": {"observacao": "x"}})
        assert r.status_code == 201, r.text
    assert r.json()["status"] == "confirmada"
    det = c.get(f"/api/v1/convocacoes/{cid}").json()
    assert det["n_tentativas"] == 2 and all(i["status"] == "liberada" for i in det["irmas"])
    assert c.post(f"/api/v1/convocacoes/{cid}/eventos", json={"tipo": "recusa"}).status_code == 409
    outra = next(i for i in lst if i["inscricao_id"] not in (minhas[0]["inscricao_id"],))
    assert c.post(f"/api/v1/convocacoes/{outra['id']}/eventos", json={"tipo": "recusa"}).status_code == 201

    p = c.get("/api/v1/painel/resumo").json()
    assert p["selecionadas_aguardando"]["total"] > 0 and p["vagas_liberadas_hoje"] >= 2 and p["inconsistencias"] == 0
    assert c.get("/api/v1/painel/unidades").json()[0]["unidade_nome"]
    rm = c.post("/api/v1/classificacao/rodadas", json={"ano": 2025, "tipo": "rematch"}).json()
    assert rm["resumo"]["excluidas_ja_confirmadas"] == 1

    cp = c.post(f"/api/v1/inscricoes/{iid}/comprovar").json()
    assert {x["criterio"] for x in cp} == {"cadunico", "bolsa_familia", "cpf", "educacao_especial"}
    assert len(c.get(f"/api/v1/inscricoes/{iid}/comprovacoes").json()) == 4
    d = c.get(f"/api/v1/inscricoes/{iid}").json()
    assert d["respostas"][0]["texto"] and d["opcoes"][0]["unidade_nome"] and d["pontuacao"] in (0, 51)
    assert "capacidade" in c.get("/api/v1/unidades/U1").json()

    with pytest.raises(Exception):
        _S.execute(text("DELETE FROM evento")); _S.commit()
    _S.rollback()
