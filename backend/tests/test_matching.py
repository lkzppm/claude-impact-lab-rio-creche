import random
from datetime import datetime

import pytest
from app.engine.matching import (
    STATUS_ALOCADA,
    STATUS_LISTA_ESPERA,
    STATUS_SEM_OPCAO,
    Inscricao,
    alocar,
    verificar_invariantes,
)
from app.engine.scoring import ItemRegua, pontuar

T0 = datetime(2025, 12, 9, 10, 0)


def insc(i, pts, prefs, desempate=(0, 0), minutos=0):
    return Inscricao(id=i, pontuacao=pts, desempate=desempate,
                     data_criacao=T0.replace(minute=minutos), preferencias=tuple(prefs))


def test_da_classico_uma_vaga_por_crianca():
    ins = [insc(1, 90, ["U1", "U2", "U3"]), insc(2, 70, ["U1", "U2", "U3"]),
           insc(3, 50, ["U1", "U2", "U3"]), insc(4, 10, ["U1", "U2", "U3"])]
    cap = {"U1": 1, "U2": 1, "U3": 1}
    s = alocar(ins, cap, vagas_presas=1)
    assert verificar_invariantes(ins, cap, s) == []
    assert [v.unidade for v in s.resultados[1].presas] == ["U1"]
    assert [v.unidade for v in s.resultados[2].presas] == ["U2"]
    assert [v.unidade for v in s.resultados[3].presas] == ["U3"]
    r4 = s.resultados[4]
    assert r4.status == STATUS_LISTA_ESPERA
    assert [(v.unidade, v.posicao) for v in r4.selecionaveis] == [("U1", 3), ("U2", 3)]  # 2 alternativas, atrás de quem listou e não foi retido
    assert s.corte_por_unidade == {"U1": 90, "U2": 70, "U3": 50}


def test_tres_presas_duas_alternativas():
    # A (90) segura as 3 primeiras; as duas restantes ficam selecionáveis com posição na fila
    ins = [insc(1, 90, ["U1", "U2", "U3", "U4", "U5"]), insc(2, 70, ["U1", "U2", "U3", "U4", "U5"])]
    cap = {u: 1 for u in ["U1", "U2", "U3", "U4", "U5"]}
    s = alocar(ins, cap, vagas_presas=3, alternativas=2)
    assert verificar_invariantes(ins, cap, s) == []
    r1, r2 = s.resultados[1], s.resultados[2]
    assert [v.unidade for v in r1.presas] == ["U1", "U2", "U3"]
    assert [v.unidade for v in r1.selecionaveis] == ["U4", "U5"]
    # B foi rejeitada em U1..U3 e segura U4 e U5 (só sobraram duas)
    assert [v.unidade for v in r2.presas] == ["U4", "U5"]
    assert [(v.unidade, v.posicao) for v in r2.selecionaveis] == [("U1", 1), ("U2", 1)]
    assert r1.selecionaveis[0].posicao == 1   # A é a 1ª da espera de U4 (B está retida lá)


def test_cota_respeitada_e_capacidade():
    ins = [insc(i, 100 - i, ["U1", "U2", "U3", "U4", "U5"]) for i in range(1, 11)]
    cap = {"U1": 2, "U2": 2, "U3": 2, "U4": 2, "U5": 2}
    s = alocar(ins, cap, vagas_presas=3)
    assert verificar_invariantes(ins, cap, s) == []
    assert all(len(r.presas) <= 3 for r in s.resultados.values())
    assert sum(len(f) for f in s.fila_por_unidade.values()) == 10


def test_desempate_e_data():
    ins = [insc(1, 50, ["U1"], desempate=(0, 0), minutos=0),
           insc(2, 50, ["U1"], desempate=(1, 0), minutos=5),
           insc(3, 50, ["U1"], desempate=(0, 0), minutos=1)]
    cap = {"U1": 2}
    s = alocar(ins, cap, vagas_presas=1)
    assert s.resultados[2].status == STATUS_ALOCADA
    assert s.resultados[1].status == STATUS_ALOCADA
    assert s.resultados[3].status == STATUS_LISTA_ESPERA


def test_sem_opcao_viavel():
    s = alocar([insc(1, 99, ["U9", "U8"])], {"U1": 3})
    r = s.resultados[1]
    assert r.status == STATUS_SEM_OPCAO and r.presas == [] and r.selecionaveis == []


def test_determinismo_e_hash():
    ins = [insc(i, (i * 37) % 100, ["U1", "U2", "U3"][: 1 + i % 3]) for i in range(1, 60)]
    cap = {"U1": 5, "U2": 7, "U3": 3}
    s1 = alocar(ins, cap)
    s2 = alocar(list(reversed(ins)), cap)
    assert s1.hash_entrada == s2.hash_entrada
    assert {k: r.motivo() for k, r in s1.resultados.items()} == {k: r.motivo() for k, r in s2.resultados.items()}
    assert alocar(ins, cap, vagas_presas=1).hash_entrada != s1.hash_entrada


@pytest.mark.parametrize("seed", range(5))
@pytest.mark.parametrize("q", [1, 3])
def test_invariantes_em_instancias_aleatorias(seed, q):
    rnd = random.Random(seed)
    unidades = [f"U{k}" for k in range(8)]
    ins = [insc(i, rnd.randint(0, 100), rnd.sample(unidades, rnd.randint(1, 5)),
                desempate=(rnd.randint(0, 1), rnd.randint(0, 1)), minutos=rnd.randint(0, 59))
           for i in range(1, 120)]
    cap = {u: rnd.randint(0, 12) for u in unidades}
    s = alocar(ins, cap, vagas_presas=q)
    assert verificar_invariantes(ins, cap, s) == []


def test_pontuacao_regua():
    regua = [ItemRegua(10, 51, False, 1), ItemRegua(11, 15, False, 2),
             ItemRegua(12, 0, True, 3), ItemRegua(13, 0, True, 4)]
    p = pontuar({10: True, 11: False, 12: True, 99: True}, regua)
    assert p.total == 51 and p.desempate == (1, 0) and p.itens == ((10, 51),)
