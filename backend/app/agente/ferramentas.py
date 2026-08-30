"""Ferramentas do assistente — todas SOMENTE LEITURA, todas passando pelo `Escopo`.

Cada ferramenta reaproveita a função do router correspondente (uma só implementação das regras: o número
que o assistente diz é o mesmo que a tela mostra) e devolve `Resultado(dados, resumo)`; o `resumo` é a linha
que o frontend exibe ("consultou: resumo do painel · 4ª CRE"). Erros de escopo, 404 dos routers e exceções
viram `{"erro": ...}` para o modelo — a rota nunca cai por causa de uma ferramenta.
"""
from __future__ import annotations

import contextlib
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agente import secoes
from app.agente import sql as sql_livre
from app.agente.escopo import Escopo, ForaDoEscopo
from app.config import get_settings
from app.models import Base, Convocacao, Inscricao, Opcao, Unidade
from app.routers import classificacao, convocacoes, familia, painel, processos, unidades
from app.routers.convocacoes import ABERTAS, FILAS, _agora, _enriquecer
from app.schemas import CapacidadeOut, RodadaOut

# objetos ORM devolvidos por routers chamados diretamente (fora do FastAPI, o response_model não converte)
_ORM_PARA_SCHEMA = {"rodada": RodadaOut, "capacidade": CapacidadeOut}

TZ_RIO = ZoneInfo("America/Sao_Paulo")
STATUS_CONVOCACAO = ("selecionada", "contato_tentado", "contato_confirmado", "confirmada", "recusada", "expirada", "liberada")


@dataclass
class Resultado:
    dados: Any
    resumo: str


@dataclass(frozen=True)
class Ferramenta:
    nome: str
    descricao: str
    fn: Callable[[Session, Escopo, dict[str, Any]], Resultado]
    propriedades: dict[str, Any] = field(default_factory=dict)
    obrigatorios: tuple[str, ...] = ()
    areas: frozenset[str] = frozenset({"cre", "sme"})

    def definicao(self) -> dict[str, Any]:
        """Formato de `tools` da API de Mensagens."""
        return {
            "name": self.nome,
            "description": self.descricao,
            "input_schema": {"type": "object", "properties": self.propriedades,
                             "required": list(self.obrigatorios), "additionalProperties": False},
        }


# ----------------------------------------------------------------------------- utilidades

def _rotulo(escopo: Escopo, cre: str | None, unidade: str | None = None) -> str:
    partes = [f"{cre}ª CRE" if cre else "rede"]
    if unidade:
        partes.append(f"unidade {unidade}")
    return " · ".join(partes)


def _dump(obj: Any) -> Any:
    if isinstance(obj, Base):
        schema = _ORM_PARA_SCHEMA.get(obj.__tablename__)
        return schema.model_validate(obj).model_dump(mode="json") if schema else str(obj)
    if hasattr(obj, "model_dump"):
        d = obj.model_dump(mode="json")
        # campos que ainda carregam ORM (ex.: UnidadeDetalhe.capacidade fora do FastAPI)
        for k, v in list(d.items()):
            if isinstance(v, list) and v and isinstance(v[0], Base):
                d[k] = [_dump(o) for o in v]
        return d
    if isinstance(obj, list):
        return [_dump(o) for o in obj]
    return obj


def _limite(args: dict, padrao: int, maximo: int) -> int:
    try:
        n = int(args.get("limit") or padrao)
    except (TypeError, ValueError):
        n = padrao
    return max(1, min(n, maximo))


def _cre_da_unidade(db: Session, codigo: str) -> str | None:
    u = db.get(Unidade, codigo)
    if not u:
        raise HTTPException(404, f"unidade {codigo} não encontrada")
    return u.cre


def _cres_da_inscricao(db: Session, inscricao_id: int) -> set[str]:
    """CREs em que a inscrição aparece: unidades das opções ∪ unidades das convocações."""
    por_opcao = db.scalars(select(Unidade.cre).join(Opcao, Opcao.unidade_codigo == Unidade.codigo)
                           .where(Opcao.inscricao_id == inscricao_id)).all()
    por_conv = db.scalars(select(Unidade.cre).join(Convocacao, Convocacao.unidade_codigo == Unidade.codigo)
                          .where(Convocacao.inscricao_id == inscricao_id)).all()
    return {str(c) for c in (*por_opcao, *por_conv) if c is not None}


# ----------------------------------------------------------------------------- ferramentas

def resumo_painel(db: Session, escopo: Escopo, args: dict) -> Resultado:
    cre = escopo.cre_efetiva(args.get("cre"))
    unidade = (args.get("unidade") or "").strip() or None
    if unidade:
        escopo.exigir_cre(_cre_da_unidade(db, unidade), f"a unidade {unidade}")
    r = painel.resumo(cre=cre, unidade=unidade, db=db)
    return Resultado(_dump(r), f"resumo do painel · {_rotulo(escopo, cre, unidade)}")


def painel_unidades(db: Session, escopo: Escopo, args: dict) -> Resultado:
    cre = escopo.cre_efetiva(args.get("cre"))
    chave = args.get("ordenar_por") or "em_atraso"
    if chave not in ("em_atraso", "convocadas", "confirmadas", "vagas", "alocadas", "liberadas"):
        chave = "em_atraso"
    limite = _limite(args, 20, 100)
    linhas = painel.unidades(cre=cre, ano=None, db=db)
    ordenadas = sorted(linhas, key=lambda u: (-getattr(u, chave), u.unidade_nome or ""))
    return Resultado(
        {"total_unidades": len(linhas), "ordenado_por": chave, "unidades": _dump(ordenadas[:limite])},
        f"unidades do painel · {_rotulo(escopo, cre)} · top {min(limite, len(linhas))} por {chave}")


def listar_convocacoes(db: Session, escopo: Escopo, args: dict) -> Resultado:
    cre = escopo.cre_efetiva(args.get("cre"))
    unidade = (args.get("unidade") or "").strip() or None
    status = (args.get("status") or "").strip() or None
    prazo = (args.get("prazo") or "").strip() or None
    if args.get("atrasadas") is True and not prazo:
        prazo = "vencido"
    incluir_codigos = bool(args.get("incluir_codigos"))
    limite = _limite(args, 20, 100)
    if status and status not in STATUS_CONVOCACAO:
        raise ValueError(f"status inválido: {status}; use um de {', '.join(STATUS_CONVOCACAO)}")
    if unidade:
        escopo.exigir_cre(_cre_da_unidade(db, unidade), f"a unidade {unidade}")

    conds = []
    if cre:
        conds.append(Unidade.cre == cre)
    if unidade:
        conds.append(Convocacao.unidade_codigo == unidade)
    agora = _agora()
    descr = []
    if prazo:
        conds.append(Convocacao.status.in_(ABERTAS))
        if prazo == "vencido":
            conds.append(Convocacao.prazo_fim < agora)
            descr.append("prazo vencido")
        elif prazo == "hoje":
            fim_dia = (agora.astimezone(TZ_RIO) + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            conds.append(Convocacao.prazo_fim >= agora)
            conds.append(Convocacao.prazo_fim < fim_dia)
            descr.append("vencem hoje")
        elif prazo in ("ate_24h", "ate_48h", "ate_72h"):
            horas = int(prazo.split("_")[1][:-1])
            conds.append(Convocacao.prazo_fim >= agora)
            conds.append(Convocacao.prazo_fim < agora + timedelta(hours=horas))
            descr.append(f"vencem em até {horas}h")
        else:
            raise ValueError("prazo inválido; use vencido, hoje, ate_24h, ate_48h ou ate_72h")
    base = (select(Convocacao, Unidade.nome, Unidade.cre, Inscricao.aluno_anon, Inscricao.pontuacao)
            .join(Unidade, Unidade.codigo == Convocacao.unidade_codigo)
            .join(Inscricao, Inscricao.id == Convocacao.inscricao_id)
            .where(*conds))
    por_status = dict(db.execute(
        select(Convocacao.status, func.count()).join(Unidade, Unidade.codigo == Convocacao.unidade_codigo)
        .where(*conds).group_by(Convocacao.status)).all())
    stmt = base
    if status:
        stmt = stmt.where(Convocacao.status == status)
        descr.append(f"status {status}")
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    linhas = db.execute(stmt.order_by(Convocacao.prazo_fim.asc().nulls_last(), Convocacao.atualizada_em, Convocacao.id)
                        .limit(limite)).all()
    itens = []
    for c, nome, cre_u, aluno, pts in linhas:
        e = _enriquecer(c, {"nome": nome, "cre": cre_u, "aluno_anon": aluno, "pontuacao": pts})
        item = {"id": e.id, "inscricao_id": e.inscricao_id, "unidade_codigo": e.unidade_codigo, "unidade": e.unidade_nome,
                "cre": e.cre, "grupamento": e.grupamento, "horario": e.horario, "status": e.status,
                "prazo_fim": e.prazo_fim.isoformat() if e.prazo_fim else None, "horas_no_status": e.horas_no_status,
                "atrasada": e.atrasada, "pontuacao": e.pontuacao}
        if incluir_codigos:
            item["aluno_anon"] = e.aluno_anon
        itens.append(item)
    dados = {"total": int(total), "por_status": {k: int(v) for k, v in por_status.items()},
             "mostrando": len(itens), "itens": itens}
    if total > len(itens):
        dados["aviso"] = f"lista cortada em {len(itens)} de {total}; use os totais para contagens"
    return Resultado(dados, f"convocações · {_rotulo(escopo, cre, unidade)}" + (" · " + ", ".join(descr) if descr else "")
                     + f" · {total} no total")


def detalhe_convocacao(db: Session, escopo: Escopo, args: dict) -> Resultado:
    cid = int(args["id"])
    det = convocacoes.detalhe(cid, db)
    escopo.exigir_cre(det.cre, f"a convocação {cid}")
    d = _dump(det)
    d["eventos"] = [{"tipo": e["tipo"], "ocorrido_em": e["ocorrido_em"], "ator": e["ator"],
                     "observacao": (e.get("payload") or {}).get("observacao")} for e in d.get("eventos", [])]
    return Resultado(d, f"convocação {cid} · {det.unidade_nome or det.unidade_codigo}")


def ficha_inscricao(db: Session, escopo: Escopo, args: dict) -> Resultado:
    codigo = str(args["codigo"]).strip()
    i = familia._localizar(db, codigo, args.get("ano"))
    escopo.exigir_alguma_cre(_cres_da_inscricao(db, i.id), f"a inscrição {codigo}")
    v = familia.visao(codigo=str(i.id), ano=None, db=db)
    d = _dump(v)
    # minimização: o resultado da comprovação sim, o payload devolvido pelo provedor não
    d["comprovacoes"] = [{"criterio": c["criterio"], "fonte": c["fonte"], "resultado": c["resultado"],
                          "consultado_em": c["consultado_em"]} for c in d.get("comprovacoes", [])]
    return Resultado(d, f"ficha da inscrição {i.id}")


def explicacao_resultado(db: Session, escopo: Escopo, args: dict) -> Resultado:
    rid, iid = int(args["rodada_id"]), int(args["inscricao_id"])
    escopo.exigir_alguma_cre(_cres_da_inscricao(db, iid), f"a inscrição {iid}")
    e = classificacao.explicacao(rid, iid, db)
    d = _dump(e)
    m = d.get("motivo") or {}
    d["motivo"] = {"propostas": m.get("propostas", []), "final": m.get("final")}
    return Resultado(d, f"explicação · rodada {rid} · inscrição {iid}")


def buscar_unidades(db: Session, escopo: Escopo, args: dict) -> Resultado:
    cre = escopo.cre_efetiva(args.get("cre"))
    q = (args.get("q") or "").strip() or None
    limite = _limite(args, 20, 100)
    lista = unidades.listar(cre=cre, q=q, limit=limite, db=db)
    itens = [{"codigo": u.codigo, "nome": u.nome, "tipo": u.tipo, "bairro": u.bairro, "cre": u.cre, "polo": u.polo}
             for u in lista]
    return Resultado({"n": len(itens), "unidades": itens},
                     f"busca de unidades · {_rotulo(escopo, cre)}" + (f" · “{q}”" if q else "") + f" · {len(itens)} encontradas")


def capacidade_unidade(db: Session, escopo: Escopo, args: dict) -> Resultado:
    codigo = str(args["codigo"]).strip()
    u = unidades.detalhe(codigo, db)
    escopo.exigir_cre(u.cre, f"a unidade {codigo}")
    linha = next((p for p in painel.unidades(cre=u.cre, ano=None, db=db) if p.unidade_codigo == codigo), None)
    abertas = dict(db.execute(select(Convocacao.status, func.count()).where(Convocacao.unidade_codigo == codigo)
                              .group_by(Convocacao.status)).all())
    d = {"unidade": {"codigo": u.codigo, "nome": u.nome, "tipo": u.tipo, "bairro": u.bairro, "cre": u.cre, "polo": u.polo},
         "capacidade": _dump(u.capacidade), "painel": _dump(linha) if linha else None,
         "convocacoes_por_status": {k: int(v) for k, v in abertas.items()},
         "nota": "capacidade com fonte 'estimada_confirmados' é estimativa a partir das matrículas confirmadas; "
                 "a base da SME traz ocupação, não oferta"}
    return Resultado(d, f"capacidade · {u.nome or codigo}")


def resumo_cres(db: Session, escopo: Escopo, args: dict) -> Resultado:
    linhas = painel.cres(ano=args.get("ano"), db=db)
    if escopo.restrito:
        linhas = [l for l in linhas if l.cre == escopo.cre]
    return Resultado(_dump(linhas), f"resumo por CRE · {escopo.rotulo}")


def rodadas(db: Session, escopo: Escopo, args: dict) -> Resultado:
    limite = _limite(args, 10, 50)
    lista = classificacao.listar(db)[:limite]
    return Resultado(_dump(lista), f"rodadas de classificação · {len(lista)} mais recentes")


def regua(db: Session, escopo: Escopo, args: dict) -> Resultado:
    ano = args.get("ano")
    if not ano:
        procs = processos.listar(db)
        if not procs:
            raise HTTPException(404, "nenhum processo carregado")
        ano = max(p.ano for p in procs)
    itens = processos.regua(int(ano), db)
    d = {"ano": int(ano), "norma": "a tabela é norma (Res. SME 542/2025 para 2026); a régua muda a cada processo",
         "perguntas": [{"ich_perg_id": p.ich_perg_id, "texto": p.texto, "pontuacao": p.pontuacao,
                        "criterio_desempate": p.criterio_desempate, "ordem": p.ordem} for p in itens]}
    return Resultado(d, f"régua de pontuação · {ano}")


def consulta_sql(db: Session, escopo: Escopo, args: dict) -> Resultado:
    if escopo.restrito:
        raise ForaDoEscopo("a consulta livre é exclusiva do Nível Central")
    s = get_settings()
    r = sql_livre.executar(db.get_bind(), str(args.get("sql") or ""), limite=s.chat_sql_max_linhas,
                           timeout_ms=s.chat_sql_timeout_ms)
    motivo = (args.get("motivo") or "").strip()
    return Resultado(r, "consulta SQL (só leitura)" + (f" · {motivo}" if motivo else "") + f" · {r['n']} linhas")


# ----------------------------------------------------------------------------- catálogo

def apontar_no_painel(db: Session, escopo: Escopo, args: dict) -> Resultado:
    """A resposta já está num card: registra a seção + resumo; a rota vira `navegacao` na resposta (secoes.py)."""
    dados, linha = secoes.apontar(db, escopo, args)
    return Resultado(dados, linha)


_CRE = {"type": "string", "description": "Número da CRE (\"1\" a \"11\"). Na área CRE é ignorado: vale sempre a CRE do usuário."}
_UNIDADE = {"type": "string", "description": "Código da unidade (esc_codigo), ex.: \"01001\"."}
_LIMIT = {"type": "integer", "description": "Máximo de itens devolvidos."}

ESQUEMA_SQL = (
    "Tabelas (PostgreSQL, só leitura): "
    "unidade(codigo, nome, tipo, bairro, cep, cre, polo, lat, lon) · "
    "inscricao(id, ano, aluno_anon, responsavel_anon, nascimento_anomes, sexo, cep, bairro, data_criacao, pontuacao) · "
    "opcao(id, inscricao_id, ordem 1..5, unidade_codigo, grupamento, horario, situacao_origem = desfecho real da SME) · "
    "resposta(inscricao_id, ich_perg_id, resposta bool, confirmado bool) · pergunta(ano, ich_perg_id, texto, pontuacao, criterio_desempate, ordem) · "
    "capacidade(ano, unidade_codigo, grupamento, horario, vagas, fonte) · "
    "rodada(id, ano, tipo inicial|rematch, criada_em, parametros jsonb, resumo jsonb) · "
    "alocacao(id, rodada_id, inscricao_id, opcao_id, unidade_codigo, grupamento, horario, status alocada|lista_espera|sem_opcao_viavel, "
    "tipo presa|selecionavel, posicao_fila, pontuacao, motivo jsonb, vaga_liberada) · "
    "convocacao(id, alocacao_id, inscricao_id, unidade_codigo, grupamento, horario, status, prazo_fim, criada_em, atualizada_em) · "
    "evento(id, ocorrido_em, tipo, convocacao_id, inscricao_id, unidade_codigo, ator, payload jsonb) · "
    "comprovacao(id, inscricao_id, criterio, fonte, resultado, consultado_em). "
    "Status de convocação: selecionada, contato_tentado, contato_confirmado, confirmada, recusada, expirada, liberada. "
    "Abertas = selecionada/contato_tentado/contato_confirmado; atrasada = aberta com prazo_fim < now()."
)

FERRAMENTAS: tuple[Ferramenta, ...] = (
    Ferramenta(
        "resumo_painel",
        "KPIs do painel de convocação: vagas aguardando resposta por faixa de tempo (0–24h, 24–48h, 48–72h, >72h), "
        "vagas em risco, famílias sem contato, inconsistências, média de vagas reservadas por criança, vagas liberadas "
        "hoje, confirmadas/recusadas/expiradas. Comece por aqui para perguntas de contagem.",
        resumo_painel, {"cre": _CRE, "unidade": _UNIDADE}),
    Ferramenta(
        "painel_unidades",
        "Uma linha por unidade do painel (vagas, alocadas, convocadas, confirmadas, em_atraso, liberadas), ordenada pelo "
        "campo pedido. Use para 'qual unidade tem mais X'.",
        painel_unidades,
        {"cre": _CRE, "ordenar_por": {"type": "string", "enum": ["em_atraso", "convocadas", "confirmadas", "vagas", "alocadas", "liberadas"]},
         "limit": _LIMIT}),
    Ferramenta(
        "listar_convocacoes",
        "Convocações com filtros: unidade, status, prazo (vencido | hoje | ate_24h | ate_48h | ate_72h — só abertas). "
        "Devolve total, contagem por status e uma amostra de itens (id, inscricao_id, unidade, status, prazo). "
        "Códigos anônimos das crianças só com incluir_codigos=true — peça só se o servidor precisar.",
        listar_convocacoes,
        {"cre": _CRE, "unidade": _UNIDADE,
         "status": {"type": "string", "enum": list(STATUS_CONVOCACAO)},
         "prazo": {"type": "string", "enum": ["vencido", "hoje", "ate_24h", "ate_48h", "ate_72h"]},
         "atrasadas": {"type": "boolean", "description": "Atalho para prazo=vencido."},
         "incluir_codigos": {"type": "boolean"}, "limit": _LIMIT}),
    Ferramenta(
        "detalhe_convocacao",
        "Uma convocação com sua linha do tempo (eventos com hora, ator e observação) e as convocações irmãs da "
        "mesma criança (outras vagas reservadas).",
        detalhe_convocacao, {"id": {"type": "integer"}}, ("id",)),
    Ferramenta(
        "ficha_inscricao",
        "Ficha de uma inscrição pelo id numérico ou pelo código anônimo da criança (aluno_anon): situação resumida, "
        "as até 5 opções com resultado (reservada/fila/sem_vaga) e posição, reservas abertas com prazo, pontuação "
        "critério a critério com comprovação, explicação do resultado. Dado sensível: use só quando a pergunta for "
        "sobre essa inscrição.",
        ficha_inscricao, {"codigo": {"type": "string"}, "ano": {"type": "integer"}}, ("codigo",)),
    Ferramenta(
        "explicacao_resultado",
        "Explicação do resultado de uma inscrição numa rodada, gerada do log de decisão do motor (por que não "
        "entrou na opção X: corte de pontuação e vagas).",
        explicacao_resultado, {"rodada_id": {"type": "integer"}, "inscricao_id": {"type": "integer"}},
        ("rodada_id", "inscricao_id")),
    Ferramenta(
        "buscar_unidades",
        "Busca unidades por nome, código ou bairro. Use para descobrir o código antes de capacidade_unidade ou de "
        "filtrar por unidade.",
        buscar_unidades, {"cre": _CRE, "q": {"type": "string", "description": "Trecho do nome, código ou bairro."}, "limit": _LIMIT}),
    Ferramenta(
        "capacidade_unidade",
        "Ficha de uma unidade: capacidade por ano/grupamento/turno com a fonte (estimada ou informada), a linha "
        "dela no painel e as convocações por status.",
        capacidade_unidade, {"codigo": {"type": "string"}}, ("codigo",)),
    Ferramenta(
        "resumo_cres",
        "Uma linha por CRE: unidades, vagas, inscrições, alocadas, convocadas, abertas, confirmadas, em atraso, lista "
        "de espera. No Nível Central, todas as CREs; na área CRE, só a do usuário.",
        resumo_cres, {"ano": {"type": "integer"}}),
    Ferramenta(
        "rodadas",
        "Rodadas de classificação já executadas (id, ano, tipo, parâmetros — vagas_presas/alternativas — e resumo: "
        "inscrições, alocadas, lista de espera, média de vagas presas por criança, distribuição por ordem da opção). "
        "Use para comparar regimes (1 vaga × 3 reservas).",
        rodadas, {"limit": _LIMIT}),
    Ferramenta(
        "regua",
        "Régua de pontuação de um processo (perguntas, pontos, critérios de desempate). É norma: só para explicar, "
        "nunca para propor mudança.",
        regua, {"ano": {"type": "integer", "description": "Ano do processo; padrão: o mais recente carregado."}}),
    Ferramenta(
        secoes.FERRAMENTA,
        "Use quando a resposta à pergunta JÁ ESTÁ num card do painel (ver 'Quando a resposta já está na tela' no "
        "prompt). Registra a seção e um resumo com os números; o painel então pergunta ao servidor se quer ser levado "
        "até o card. Chame DEPOIS de consultar os números, no máximo uma vez por resposta, e não repita os números no "
        "texto final.",
        apontar_no_painel,
        {"secao": {"type": "string", "description": "Id da seção, ex.: \"cre.para_hoje\" ou \"sme.tabela_cre\"."},
         "resumo": {"type": "string", "description": "1 a 3 frases, em português, com a resposta em números (vindos das "
                    "ferramentas). É o que o servidor lê no chat depois de aceitar ou recusar ir ao card."},
         "fila": {"type": "string", "enum": list(FILAS), "description": "Só para cre.convocacoes: qual fila abrir."},
         "unidade": _UNIDADE},
        ("secao", "resumo")),
    Ferramenta(
        "consulta_sql",
        "Consulta SQL livre, SOMENTE SELECT, para perguntas que as outras ferramentas não cobrem. Limite de 200 "
        "linhas, timeout curto. Prefira agregados (COUNT, GROUP BY) a listas de crianças. " + ESQUEMA_SQL,
        consulta_sql,
        {"sql": {"type": "string", "description": "Um único SELECT (ou WITH), sem ponto e vírgula."},
         "motivo": {"type": "string", "description": "Uma frase dizendo o que a consulta responde."}},
        ("sql",), frozenset({"sme"})),
)


def catalogo(escopo: Escopo) -> dict[str, Ferramenta]:
    return {f.nome: f for f in FERRAMENTAS if escopo.area in f.areas}


def executar(db: Session, escopo: Escopo, nome: str, args: dict[str, Any], *, ferramentas: dict[str, Ferramenta] | None = None) -> Resultado:
    """Executa uma ferramenta. Nunca levanta: erro vira `{"erro": ...}` (o modelo explica ao servidor)."""
    fs = ferramentas if ferramentas is not None else catalogo(escopo)
    f = fs.get(nome)
    if f is None:
        return Resultado({"erro": f"ferramenta desconhecida ou indisponível nesta área: {nome}"}, f"{nome} (indisponível)")
    try:
        return f.fn(db, escopo, dict(args or {}))
    except ForaDoEscopo as e:
        return Resultado({"erro": str(e)}, f"{nome} (fora do escopo)")
    except HTTPException as e:
        return Resultado({"erro": str(e.detail)}, f"{nome} (não encontrado)")
    except sql_livre.SqlRejeitado as e:
        return Resultado({"erro": f"consulta rejeitada: {e}"}, f"{nome} (rejeitada)")
    except (KeyError, TypeError, ValueError) as e:
        return Resultado({"erro": f"argumento inválido: {e}"}, f"{nome} (argumento inválido)")
    except Exception as e:  # noqa: BLE001 — a rota não cai por causa de uma ferramenta
        with contextlib.suppress(Exception):
            db.rollback()
        return Resultado({"erro": f"falha ao consultar o banco: {type(e).__name__}"}, f"{nome} (falhou)")
