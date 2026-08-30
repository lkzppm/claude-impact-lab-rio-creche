"""Teste de integração ponta a ponta contra o Postgres.

⚠️ Ele TRUNCA todas as tabelas. Por isso só roda quando `TEST_DATABASE_URL` está definido — nunca contra o
banco de desenvolvimento/demo por acidente. Ex.: TEST_DATABASE_URL=postgresql+psycopg://creche:creche@localhost:5432/creche_test

Cobre: rodada com 3 presas + 2 alternativas, rodada clássica (1 presa), convocações por vaga presa,
confirmação liberando as irmãs, transição inválida, painel, rematch, comprovação mock e trigger append-only;
e as ferramentas do polo: filas de trabalho, próxima ação, convocar o próximo da fila, fila da unidade,
capacidade informada, expiração em lote e crianças com várias reservas.
"""
import os
import random
from datetime import datetime, timedelta

import pytest
from app.db import get_sessionmaker
from app.models import Capacidade, Inscricao, Opcao, Pergunta, Processo, Resposta, Unidade
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

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
    from app.main import app
    from fastapi.testclient import TestClient
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

    with pytest.raises(DBAPIError):  # trigger append-only da tabela evento
        _S.execute(text("DELETE FROM evento")); _S.commit()
    _S.rollback()


def test_ferramentas_do_polo(cliente):
    """Depende do estado deixado por test_fluxo_completo (uma confirmada, uma recusada, rodadas 1 e 2)."""
    c = cliente
    # filas de trabalho e próxima ação
    abertas = c.get("/api/v1/convocacoes", params={"fila": "trabalho", "size": 200}).json()
    assert abertas["total"] > 0 and all(i["proxima_acao"] for i in abertas["items"])
    assert c.get("/api/v1/convocacoes", params={"fila": "vencidas"}).json()["total"] == 0     # tudo criado agora
    assert c.get("/api/v1/convocacoes", params={"fila": "vencem_24h"}).json()["total"] == 0   # prazo de 3 dias
    enc = c.get("/api/v1/convocacoes", params={"fila": "encerradas", "size": 200}).json()
    assert {i["status"] for i in enc["items"]} >= {"confirmada", "recusada"}
    assert c.get("/api/v1/convocacoes", params={"fila": "inexistente"}).status_code == 422

    # a recusada ainda não foi repassada: quem é o próximo da fila?
    rec = c.get("/api/v1/convocacoes", params={"status": "recusada"}).json()["items"][0]
    det = c.get(f"/api/v1/convocacoes/{rec['id']}").json()
    assert det["repassada_para"] is None
    fila = c.get(f"/api/v1/unidades/{rec['unidade_codigo']}/fila").json()
    assert fila["rodada_id"] and fila["grupamento"] == "Berçário" and fila["n_reservadas"] > 0
    assert all(i["situacao"] in ("aguardando", "convocada_aqui", "confirmada_em_outra", "reservas_cheias") for i in fila["itens"])
    if det["proximo_da_fila"]:
        prox = det["proximo_da_fila"]
        assert prox["posicao_fila"] and prox["reservas_abertas"] < 3
        nova = c.post(f"/api/v1/convocacoes/{rec['id']}/convocar-proximo", json={"ator": "Maria"})
        assert nova.status_code == 201, nova.text
        nova = nova.json()
        assert nova["inscricao_id"] == prox["inscricao_id"] and nova["status"] == "selecionada"
        assert [e["tipo"] for e in nova["eventos"]] == ["selecionada_da_lista"] and nova["eventos"][0]["ator"] == "Maria"
        det2 = c.get(f"/api/v1/convocacoes/{rec['id']}").json()
        assert det2["repassada_para"] == nova["id"] and det2["proximo_da_fila"] is None
        assert c.post(f"/api/v1/convocacoes/{rec['id']}/convocar-proximo", json={}).status_code == 409
    # só vaga liberada pode ser repassada
    aberta = abertas["items"][0]
    assert c.post(f"/api/v1/convocacoes/{aberta['id']}/convocar-proximo", json={}).status_code == 409

    # capacidade informada pela unidade → fonte = informada + evento no log
    cap = c.put("/api/v1/unidades/U1/capacidade", json={"ano": 2025, "grupamento": "Berçário", "horario": "Integral", "vagas": 9, "ator": "Maria"})
    assert cap.status_code == 200 and cap.json()["vagas"] == 9 and cap.json()["fonte"] == "informada"
    assert _S.execute(text("SELECT count(*) FROM evento WHERE tipo = 'capacidade_informada' AND ator = 'Maria'")).scalar() == 1

    # crianças com várias reservas + KPIs novos do painel
    multi = c.get("/api/v1/painel/multireserva").json()
    r = c.get("/api/v1/painel/resumo").json()
    assert r["criancas_multireserva"] == len(multi) and all(m["n_abertas"] > 1 for m in multi)
    assert r["sem_aviso"] == r["sem_contato"] and r["n_desfechos"] >= 2 and r["tempo_medio_ate_desfecho_h"] is not None

    # expiração em lote: força um prazo vencido e expira só a unidade dele
    alvo = abertas["items"][0]
    _S.execute(text("UPDATE convocacao SET prazo_fim = now() - interval '1 hour' WHERE id = :id"), {"id": alvo["id"]}); _S.commit()
    assert c.get("/api/v1/convocacoes", params={"fila": "vencidas"}).json()["total"] == 1
    e = c.post("/api/v1/convocacoes/expirar-vencidas", json={"unidade": alvo["unidade_codigo"], "ator": "Maria"}).json()
    assert e["expiradas"] == 1 and e["ids"] == [alvo["id"]]
    assert c.get(f"/api/v1/convocacoes/{alvo['id']}").json()["status"] == "expirada"
    assert c.get("/api/v1/convocacoes", params={"fila": "vencidas"}).json()["total"] == 0


def test_motor_continuo(cliente):
    """O motor trabalha sozinho: cada ciclo repassa as vagas liberadas ao próximo da fila e reclassifica
    quando a entrada muda — sem duplicar convocação de quem já está com reserva aberta."""
    c = cliente
    ABERTAS = ("selecionada", "contato_tentado", "contato_confirmado")
    antes = c.get("/api/v1/motor").json()
    pendentes = antes["vagas_liberadas_pendentes"]
    assert pendentes > 0, "a confirmação liberou as irmãs e uma convocação expirou: há vaga para repassar"

    est = c.post("/api/v1/motor/ciclo").json()
    ciclo = est["ultimo_ciclo"]
    assert ciclo["erro"] is None, ciclo
    assert ciclo["repassadas"] + ciclo["vagas_sem_fila"] == pendentes
    assert est["vagas_liberadas_pendentes"] == ciclo["vagas_sem_fila"]      # só sobra o que não tem fila
    assert est["ciclos"] >= 1 and est["total_repassadas"] == ciclo["repassadas"]

    # idempotente: a mesma vaga não é repassada duas vezes
    ciclo2 = c.post("/api/v1/motor/ciclo").json()["ultimo_ciclo"]
    assert ciclo2["repassadas"] == 0 and ciclo2["rodada_criada"] is False
    if ciclo["repassadas"]:
        assert c.get("/api/v1/motor/eventos").json()[0]["repassadas"] == ciclo["repassadas"]

    # a unidade informa vaga nova → a entrada mudou → o motor reclassifica sozinho no ciclo seguinte
    assert c.put("/api/v1/unidades/U2/capacidade",
                 json={"ano": 2025, "grupamento": "Berçário", "horario": "Integral", "vagas": 7}).status_code == 200
    ciclo3 = c.post("/api/v1/motor/ciclo").json()["ultimo_ciclo"]
    assert ciclo3["rodada_criada"] is True and ciclo3["motivo_rodada"] == "entrada_mudou"
    assert ciclo3["rodada_id"] > ciclo["rodada_id"]

    # e a rodada nova não recria convocação de quem já tem reserva aberta nem passa da cota de 3
    lst = c.get("/api/v1/convocacoes", params={"size": 500}).json()["items"]
    por_crianca: dict[int, int] = {}
    pares = set()
    for i in lst:
        if i["status"] in ABERTAS:
            por_crianca[i["inscricao_id"]] = por_crianca.get(i["inscricao_id"], 0) + 1
        if i["status"] != "liberada":
            chave = (i["inscricao_id"], i["unidade_codigo"])
            assert chave not in pares, f"convocação duplicada para {chave}"
            pares.add(chave)
    assert por_crianca and max(por_crianca.values()) <= 3
    assert c.get("/api/v1/painel/resumo").json()["inconsistencias"] == 0


def test_mapa_drilldown(cliente):
    """Mapa: nível rede (uma linha por CRE) → nível CRE (todas as unidades, inclusive as sem convocação)."""
    c = cliente
    rede = c.get("/api/v1/painel/mapa").json()
    assert rede["nivel"] == "rede" and rede["cre"] is None and rede["unidades"] == []
    assert {x["cre"] for x in rede["cres"]} == {"1", "2"}
    assert sum(x["unidades"] for x in rede["cres"]) == 6      # as 6 unidades do fixture
    assert all(x["unidades_no_mapa"] == 0 for x in rede["cres"])   # o fixture não tem lat/lon
    assert sum(x["vagas"] for x in rede["cres"]) > 0 and sum(x["convocadas"] for x in rede["cres"]) > 0

    alvo = rede["cres"][0]
    det = c.get("/api/v1/painel/mapa", params={"cre": alvo["cre"]}).json()
    assert det["nivel"] == "cre" and det["cre"] == alvo["cre"]
    assert len(det["unidades"]) == alvo["unidades"] and all(u["cre"] == alvo["cre"] for u in det["unidades"])
    assert sum(u["vagas"] for u in det["unidades"]) == alvo["vagas"]
    assert sum(u["convocadas"] for u in det["unidades"]) == alvo["convocadas"]
    assert c.get("/api/v1/painel/mapa", params={"cre": "99"}).json()["unidades"] == []
