"""Motor de classificação por criança — Deferred Acceptance com cota de vagas presas por criança.

Código puro: sem I/O, sem banco, sem LLM. Consome exatamente o que a Res. SME 542/2025 já define:
a ordem de preferência da família (opções 1..5) e a prioridade da unidade (pontuação + desempates).

Parâmetros de política:
- `vagas_presas` (padrão 3): quantas vagas uma criança pode segurar simultaneamente. Com 1, é o
  Deferred Acceptance clássico (uma vaga por criança, resultado estável). Com 3, reproduz a regra
  "3 vagas presas + 2 alternativas" — a cascata continua rodando aqui, em memória, e não no calendário.
- `alternativas` (padrão 2): quantas opções restantes ficam marcadas como `selecionavel` (lista de espera
  com posição na fila), para convocação posterior.

Ordem de prioridade dentro de cada unidade (spec/11):
    pontuacao desc → desempate (tupla) desc → data_criacao asc → id asc
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

STATUS_ALOCADA = "alocada"
STATUS_LISTA_ESPERA = "lista_espera"
STATUS_SEM_OPCAO = "sem_opcao_viavel"
TIPO_PRESA = "presa"
TIPO_SELECIONAVEL = "selecionavel"


@dataclass(frozen=True)
class Inscricao:
    id: int
    pontuacao: int
    desempate: tuple[int, ...]          # ex.: (irmao_na_rede, responsavel_menor_18) — 1 = sim
    data_criacao: datetime | None
    preferencias: tuple[str, ...]       # códigos de unidade, na ordem da família (1ª..5ª)

    def chave_prioridade(self) -> tuple:
        """Menor = mais prioritário (ordena asc)."""
        ts = self.data_criacao.timestamp() if self.data_criacao else float("inf")
        return (-self.pontuacao, tuple(-d for d in self.desempate), ts, self.id)


@dataclass
class Vaga:
    unidade: str
    ordem: int                          # 1..5 da opção
    posicao: int                        # posição na fila da unidade (1 = topo)
    tipo: str                           # presa | selecionavel


@dataclass
class Resultado:
    inscricao_id: int
    status: str                         # alocada (≥1 presa) | lista_espera | sem_opcao_viavel
    pontuacao: int
    presas: list[Vaga] = field(default_factory=list)
    selecionaveis: list[Vaga] = field(default_factory=list)
    propostas: list[dict[str, Any]] = field(default_factory=list)

    @property
    def unidade(self) -> str | None:       # compatibilidade: 1ª vaga presa
        return self.presas[0].unidade if self.presas else None

    def motivo(self) -> dict[str, Any]:
        return {
            "propostas": self.propostas,
            "presas": [vars(v) for v in self.presas],
            "selecionaveis": [vars(v) for v in self.selecionaveis],
        }


@dataclass
class Saida:
    resultados: dict[int, Resultado]
    fila_por_unidade: dict[str, list[int]]    # retidos (presas) em cada unidade, por prioridade
    espera_por_unidade: dict[str, list[int]]  # não retidos que listaram a unidade, por prioridade
    corte_por_unidade: dict[str, int | None]  # menor pontuação retida (None = sobrou vaga)
    iteracoes: int
    hash_entrada: str
    parametros: dict[str, int]


def hash_entrada(inscricoes: list[Inscricao], capacidade: dict[str, int], **params: int) -> str:
    """Hash determinístico da entrada — mesma entrada ⇒ mesmo hash ⇒ mesma saída."""
    payload = {
        "inscricoes": sorted(
            (i.id, i.pontuacao, list(i.desempate),
             i.data_criacao.isoformat() if i.data_criacao else None, list(i.preferencias))
            for i in inscricoes
        ),
        "capacidade": sorted(capacidade.items()),
        "parametros": sorted(params.items()),
    }
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()


def alocar(inscricoes: list[Inscricao], capacidade: dict[str, int],
           vagas_presas: int = 3, alternativas: int = 2) -> Saida:
    """Executa o DA para um grupo (ano, grupamento, horário).

    `capacidade` mapeia código da unidade → vagas. Unidades ausentes têm capacidade 0.
    """
    if vagas_presas < 1:
        raise ValueError("vagas_presas deve ser >= 1")
    por_id = {i.id: i for i in inscricoes}
    chave = {i.id: i.chave_prioridade() for i in inscricoes}

    # Preferências saneadas: só unidades com capacidade > 0, sem repetição
    prefs: dict[int, list[tuple[int, str]]] = {}
    for i in inscricoes:
        vistas: set[str] = set()
        lista = []
        for ordem, u in enumerate(i.preferencias, start=1):
            if u in vistas:
                continue
            vistas.add(u)
            if capacidade.get(u, 0) > 0:
                lista.append((ordem, u))
        prefs[i.id] = lista
    ordem_de: dict[int, dict[str, int]] = {cid: {u: o for o, u in lst} for cid, lst in prefs.items()}

    proximo: dict[int, int] = {i.id: 0 for i in inscricoes}     # índice da próxima proposta
    segurando: dict[int, set[str]] = {i.id: set() for i in inscricoes}
    retidos: dict[str, list[int]] = {u: [] for u in capacidade}
    propostas: dict[int, list[dict[str, Any]]] = {i.id: [] for i in inscricoes}

    def pode_propor(cid: int) -> bool:
        return len(segurando[cid]) < vagas_presas and proximo[cid] < len(prefs[cid])

    pendentes = sorted((i.id for i in inscricoes if pode_propor(i.id)), key=lambda k: chave[k])
    iteracoes = 0
    while pendentes:
        iteracoes += 1
        acordar: set[int] = set()
        for cid in pendentes:
            # uma criança propõe a todas as opções que consegue nesta iteração
            while pode_propor(cid):
                ordem, u = prefs[cid][proximo[cid]]
                proximo[cid] += 1
                fila = retidos.setdefault(u, [])
                fila.append(cid)
                fila.sort(key=lambda k: chave[k])
                segurando[cid].add(u)
                cap = capacidade.get(u, 0)
                if len(fila) > cap:
                    rejeitado = fila.pop()
                    segurando[rejeitado].discard(u)
                    corte = por_id[fila[-1]].pontuacao if fila else None
                    if rejeitado == cid:
                        propostas[cid].append({"unidade": u, "ordem": ordem, "resultado": "rejeitada",
                                               "corte": corte, "vagas": cap})
                    else:
                        propostas[cid].append({"unidade": u, "ordem": ordem, "resultado": "retida_provisoriamente",
                                               "corte": corte, "vagas": cap})
                        propostas[rejeitado].append({"unidade": u, "ordem": ordem_de[rejeitado][u],
                                                     "resultado": "desbancada", "corte": corte, "vagas": cap})
                        acordar.add(rejeitado)
                else:
                    propostas[cid].append({"unidade": u, "ordem": ordem, "resultado": "retida_provisoriamente",
                                           "corte": None, "vagas": cap})
        pendentes = sorted((k for k in acordar if pode_propor(k)), key=lambda k: chave[k])

    # Consolidação
    corte_por_unidade = {
        u: (por_id[fila[-1]].pontuacao if fila and len(fila) >= capacidade.get(u, 0) else None)
        for u, fila in retidos.items()
    }
    # Fila de espera por unidade: quem listou e não está retido lá, por prioridade
    espera: dict[str, list[int]] = {u: [] for u in capacidade}
    for i in inscricoes:
        for _, u in prefs[i.id]:
            if u not in segurando[i.id]:
                espera[u].append(i.id)
    for u in espera:
        espera[u].sort(key=lambda k: chave[k])
    pos_espera = {u: {cid: p + 1 for p, cid in enumerate(lst)} for u, lst in espera.items()}

    resultados: dict[int, Resultado] = {}
    for i in inscricoes:
        presas = [Vaga(unidade=u, ordem=ordem, posicao=retidos[u].index(i.id) + 1, tipo=TIPO_PRESA)
                  for ordem, u in prefs[i.id] if u in segurando[i.id]]
        selecionaveis = [Vaga(unidade=u, ordem=ordem, posicao=pos_espera[u][i.id], tipo=TIPO_SELECIONAVEL)
                         for ordem, u in prefs[i.id] if u not in segurando[i.id]][:alternativas]
        if presas:
            status = STATUS_ALOCADA
        elif selecionaveis:
            status = STATUS_LISTA_ESPERA
        else:
            status = STATUS_SEM_OPCAO
        resultados[i.id] = Resultado(inscricao_id=i.id, status=status, pontuacao=i.pontuacao,
                                     presas=presas, selecionaveis=selecionaveis, propostas=propostas[i.id])

    params = {"vagas_presas": vagas_presas, "alternativas": alternativas}
    return Saida(
        resultados=resultados,
        fila_por_unidade={u: list(f) for u, f in retidos.items()},
        espera_por_unidade=espera,
        corte_por_unidade=corte_por_unidade,
        iteracoes=iteracoes,
        hash_entrada=hash_entrada(inscricoes, capacidade, **params),
        parametros=params,
    )


# --- Verificações (usadas nos testes e disponíveis para auditoria) -----------------------------

def verificar_invariantes(inscricoes: list[Inscricao], capacidade: dict[str, int], saida: Saida) -> list[str]:
    """Devolve a lista de violações (vazia = ok). Estabilidade só é exigida com vagas_presas = 1."""
    erros: list[str] = []
    chave = {i.id: i.chave_prioridade() for i in inscricoes}
    q = saida.parametros["vagas_presas"]

    # 1. cota por criança
    contagem: dict[int, int] = {}
    for u, fila in saida.fila_por_unidade.items():
        for cid in fila:
            contagem[cid] = contagem.get(cid, 0) + 1
    for cid, n in contagem.items():
        if n > q:
            erros.append(f"inscricao {cid} segura {n} vagas (cota {q})")
    for r in saida.resultados.values():
        if len(r.presas) != contagem.get(r.inscricao_id, 0):
            erros.append(f"inscricao {r.inscricao_id}: presas ({len(r.presas)}) ≠ filas ({contagem.get(r.inscricao_id, 0)})")

    # 2. capacidade respeitada
    for u, fila in saida.fila_por_unidade.items():
        if len(fila) > capacidade.get(u, 0):
            erros.append(f"unidade {u} acima da capacidade: {len(fila)} > {capacidade.get(u, 0)}")

    # 3. estabilidade (clássica) quando q = 1
    if q == 1:
        alocado = {r.inscricao_id: r.unidade for r in saida.resultados.values() if r.status == STATUS_ALOCADA}
        for i in inscricoes:
            atual = alocado.get(i.id)
            for u in i.preferencias:
                if u == atual:
                    break
                if capacidade.get(u, 0) == 0:
                    continue
                fila = saida.fila_por_unidade.get(u, [])
                if len(fila) < capacidade[u]:
                    erros.append(f"instável: {i.id} prefere {u} (com vaga sobrando) a {atual}")
                    break
                pior = max(fila, key=lambda k: chave[k])
                if chave[i.id] < chave[pior]:
                    erros.append(f"instável: {i.id} prefere {u} e tem prioridade sobre {pior}")
                    break
    return erros
