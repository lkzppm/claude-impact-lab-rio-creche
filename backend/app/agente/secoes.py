"""O que o painel já mostra na tela. O assistente usa este mapa para reconhecer que a resposta está num card e
oferecer levar o servidor até ele, em vez de repetir no chat o que a página já diz.

Cada `Secao` casa com um `data-secao` do frontend (`<Card secao="…">` ou o atributo direto). A ferramenta
`apontar_no_painel` valida a seção contra a área do usuário e devolve a rota; a rota HTTP (routers/chat.py)
transforma a última chamada bem-sucedida em `ChatResposta.navegacao`, e o frontend faz o resto: pergunta se o
servidor quer ir, navega, rola até o card, destaca e mostra o resumo no chat.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.agente.escopo import Escopo
from app.models import Unidade
from app.routers.convocacoes import FILAS

FERRAMENTA = "apontar_no_painel"


@dataclass(frozen=True)
class Secao:
    id: str
    area: str                          # "cre" | "sme"
    pagina: str                        # nome da página, como no menu
    rota: str                          # pode ter {unidade}
    titulo: str                        # título do card, como aparece na tela
    mostra: str                        # o que o card responde (texto para o modelo)
    parametros: tuple[str, ...] = ()   # "fila" e/ou "unidade"; obrigatório quando aparece na rota como {unidade}


SECOES: tuple[Secao, ...] = (
    # ---------------------------------------------------------------- CRE / polo
    Secao("cre.motor", "cre", "Painel da CRE", "/cre", "Motor de classificação",
          "estado do motor contínuo (ligado/desligado, último ciclo, intervalo) — versão compacta no painel da CRE"),
    Secao("cre.para_hoje", "cre", "Painel da CRE", "/cre", "Para hoje",
          "rosca das convocações abertas por urgência (vencidas, vencem em 24 h, no prazo) com o total de abertas no "
          "centro; quantas famílias ainda não foram avisadas (sem aviso); quantas crianças seguram mais de uma vaga; "
          "botão para registrar as vencidas em lote"),
    Secao("cre.numeros", "cre", "Painel da CRE", "/cre", "Os números da CRE",
          "quantas crianças a CRE tem (cadastradas em todos os processos da base, inscritas no processo atual e "
          "em pré-cadastro), quantas unidades, vagas informadas pelas unidades, expectativa de vagas totais "
          "(informadas + estimadas), vagas livres e lista de espera"),
    Secao("cre.fila_trabalho", "cre", "Painel da CRE", "/cre", "Fila de trabalho",
          "as 8 convocações mais urgentes da CRE, cada uma com a criança, a unidade, o status, o prazo e a próxima ação"),
    Secao("cre.tempo_paradas", "cre", "Painel da CRE", "/cre", "Há quanto tempo as convocações estão paradas",
          "convocações abertas por tempo na situação atual: menos de 1 dia, 1 a 2 dias, 2 a 3 dias, mais de 3 dias"),
    Secao("cre.desfechos", "cre", "Painel da CRE", "/cre", "Como as convocações estão terminando",
          "abertas × matrículas confirmadas × recusadas × prazo vencido registrado; tempo médio até o desfecho; vagas "
          "liberadas hoje; média de reservas por criança; inconsistências"),
    Secao("cre.unidades_vencidas", "cre", "Painel da CRE", "/cre", "Unidades com mais convocações vencidas",
          "ranking das 8 unidades com mais convocações vencidas (vagas em risco)"),
    Secao("cre.por_unidade", "cre", "Painel da CRE", "/cre", "Por unidade",
          "tabela com uma linha por unidade da CRE: vagas, reservadas, convocadas, confirmadas, liberadas, vencidas"),
    Secao("cre.convocacoes", "cre", "Convocações", "/cre/convocacoes", "Convocações",
          "lista de convocações por fila (vencidas, vencem_24h, sem_aviso, aguardando, abertas, trabalho, encerradas), da "
          "mais urgente para a menos, com status, prazo e próxima ação; pode ser filtrada por unidade", ("fila", "unidade")),
    Secao("cre.multireserva", "cre", "Várias reservas", "/cre/multireserva", "Várias reservas",
          "crianças com mais de uma vaga reservada ao mesmo tempo, com as unidades e os prazos de cada reserva", ("unidade",)),
    Secao("cre.unidades", "cre", "Unidades", "/cre/unidades", "Unidades",
          "lista das creches e EDIs da CRE, com tipo, bairro e capacidade estimada"),
    Secao("cre.unidades_ocupacao", "cre", "Unidades", "/cre/unidades", "Mais cheias e mais vazias",
          "as 8 unidades da CRE com maior e as 8 com menor ocupação — vagas reservadas ÷ vagas do processo; "
          "só entram unidades com vaga registrada"),
    Secao("cre.unidade_fila", "cre", "Unidade", "/cre/unidades/{unidade}", "Fila de espera",
          "fila de espera de UMA unidade, por grupamento e turno, na ordem do motor, com a situação de cada criança",
          ("unidade",)),
    Secao("cre.unidade_capacidade", "cre", "Unidade", "/cre/unidades/{unidade}", "Capacidade por grupamento e turno",
          "capacidade de UMA unidade por ano, grupamento e turno, com a fonte (estimada ou informada)", ("unidade",)),
    # ---------------------------------------------------------------- Nível Central
    Secao("sme.tempo_paradas", "sme", "Visão da rede", "/sme", "Há quanto tempo as convocações estão paradas",
          "convocações abertas na rede inteira por tempo na situação atual: menos de 1 dia, 1 a 2, 2 a 3, mais de 3 dias"),
    Secao("sme.desfechos", "sme", "Visão da rede", "/sme", "Como as convocações estão terminando",
          "na rede: abertas × confirmadas × recusadas × prazo vencido registrado; tempo médio da seleção à resposta"),
    Secao("sme.indicadores", "sme", "Visão da rede", "/sme", "Indicadores da rede",
          "vencidas, sem aviso, aguardando a família, média de vagas reservadas por criança e vagas liberadas hoje — "
          "totais da rede"),
    Secao("sme.convocacoes_por_cre", "sme", "Visão da rede", "/sme", "Convocações por CRE",
          "uma barra por CRE (confirmadas, abertas no prazo, vencidas, recusadas/vencidas já registradas) ordenadas pela CRE "
          "com mais vencidas, com o total de convocações geradas em cada CRE"),
    Secao("sme.lista_espera_cre", "sme", "Visão da rede", "/sme", "Lista de espera por CRE",
          "crianças em lista de espera (sem vaga reservada) em cada CRE, da maior para a menor"),
    Secao("sme.vagas_inscricoes_cre", "sme", "Visão da rede", "/sme", "Vagas e inscrições por CRE",
          "vagas estimadas contra inscrições de 1ª opção em cada CRE e a razão inscrições ÷ vagas"),
    Secao("sme.tabela_cre", "sme", "Visão da rede", "/sme", "Tabela por CRE",
          "tabela com uma linha por CRE: unidades, vagas, inscrições, reservadas, convocadas, abertas, confirmadas, "
          "vencidas e lista de espera"),
    Secao("sme.motor", "sme", "Visão da rede", "/sme", "Motor de classificação",
          "estado do motor contínuo (ligado/desligado, último ciclo, intervalo) e as rodadas já executadas: ano, tipo, "
          "parâmetros (vagas presas, alternativas) e resumo"),
    Secao("sme.inscricoes", "sme", "Inscrições", "/sme/inscricoes", "Inscrições",
          "lista paginada de inscrições, com busca pelo código da criança/responsável e filtros por ano, CRE, "
          "unidade e situação da opção"),
    Secao("sme.unidades", "sme", "Unidades", "/sme/unidades", "Unidades",
          "lista das creches e EDIs da rede, com CRE, tipo, bairro e capacidade estimada"),
    Secao("sme.unidades_ocupacao", "sme", "Unidades", "/sme/unidades", "Mais cheias e mais vazias",
          "as 8 unidades da rede com maior e as 8 com menor ocupação — vagas reservadas ÷ vagas do processo; "
          "só entram unidades com vaga registrada"),
    Secao("sme.unidade_capacidade", "sme", "Unidade", "/sme/unidades/{unidade}", "Capacidade por grupamento e turno",
          "capacidade de UMA unidade por ano, grupamento e turno, com a fonte (estimada ou informada)", ("unidade",)),
    Secao("sme.regua", "sme", "Régua", "/sme/regua", "Régua de pontuação",
          "perguntas, pontos e critérios de desempate do processo (somente leitura)"),
)

POR_ID: dict[str, Secao] = {s.id: s for s in SECOES}

REGRA = """# Quando a resposta já está na tela
O painel tem cards fixos, listados abaixo com o id da seção. Se a pergunta do servidor é respondida por um desses cards — o mesmo número ou a mesma lista, no mesmo recorte —, faça assim:
1. consulte as ferramentas normalmente para ter os números;
2. chame `apontar_no_painel` com o id da seção e um `resumo` de 1 a 3 frases com a resposta em números;
3. no texto final, diga que essa informação já está no painel, nomeie o card e a página, e pergunte se o servidor quer que você o leve até lá. Não repita os números no texto: o resumo aparece no chat depois que ele responder.
Se nenhum card mostra a resposta (recorte que o painel não tem, pergunta sobre uma inscrição ou convocação específica, cruzamento que o painel não faz, dúvida sobre regra ou conceito), responda direto no chat, com os números, sem apontar. No máximo uma seção por resposta. Se o servidor acabou de recusar ir a um card, não ofereça de novo para a mesma pergunta: responda no chat.

Seções do painel nesta área:"""


def secoes(area: str) -> list[Secao]:
    return [s for s in SECOES if s.area == area]


def descrever(area: str) -> str:
    """Bloco do prompt de sistema: a regra e o que cada card mostra. Estável por área (cacheável)."""
    linhas = []
    for s in secoes(area):
        extra = ""
        if s.parametros:
            obrig = [p for p in s.parametros if "{" + p + "}" in s.rota]
            opc = [p for p in s.parametros if p not in obrig]
            partes = ([f"exige {', '.join(obrig)}"] if obrig else []) + ([f"aceita {', '.join(opc)}"] if opc else [])
            extra = f" [{'; '.join(partes)}]"
        linhas.append(f'- `{s.id}` — página "{s.pagina}", card "{s.titulo}": {s.mostra}{extra}')
    return REGRA + "\n" + "\n".join(linhas)


def resolver(escopo: Escopo, args: dict[str, Any]) -> tuple[Secao, str]:
    """Seção + rota final a partir dos argumentos da ferramenta. Sem banco (a unidade é conferida em `apontar`).
    Levanta ValueError com a mensagem que o modelo lê."""
    secao_id = str(args.get("secao") or "").strip()
    s = POR_ID.get(secao_id)
    if s is None or s.area != escopo.area:
        validas = ", ".join(x.id for x in secoes(escopo.area))
        raise ValueError(f"seção desconhecida nesta área: {secao_id or '(vazia)'}; use uma de: {validas}")
    rota = s.rota
    unidade = str(args.get("unidade") or "").strip()
    fila = str(args.get("fila") or "").strip()
    if "{unidade}" in rota:
        if not unidade:
            raise ValueError(f"a seção {s.id} precisa do código da unidade (parâmetro unidade)")
        rota = rota.replace("{unidade}", quote(unidade, safe=""))
        unidade = ""
    query: list[str] = []
    if fila:
        if "fila" not in s.parametros:
            raise ValueError(f"a seção {s.id} não aceita fila")
        if fila not in FILAS:
            raise ValueError(f"fila desconhecida: {fila}; use uma de: {', '.join(FILAS)}")
        query.append(f"fila={fila}")
    if unidade:
        if "unidade" not in s.parametros:
            raise ValueError(f"a seção {s.id} não aceita filtro por unidade")
        query.append(f"unidade={quote(unidade, safe='')}")
    if query:
        rota += "?" + "&".join(query)
    return s, rota


def apontar(db: Session, escopo: Escopo, args: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Corpo da ferramenta. Devolve (dados para o modelo, linha para o chat). Exceções viram `{"erro": …}` no
    `ferramentas.executar`: ValueError → argumento inválido; ForaDoEscopo → fora do escopo."""
    s, rota = resolver(escopo, args)
    resumo = str(args.get("resumo") or "").strip()
    if not resumo:
        raise ValueError("resumo é obrigatório: 1 a 3 frases com a resposta em números")
    unidade = str(args.get("unidade") or "").strip()
    if unidade:
        u = db.get(Unidade, unidade)
        if u is None:
            raise ValueError(f"unidade {unidade} não encontrada; use buscar_unidades para achar o código")
        escopo.exigir_cre(u.cre, f"a unidade {u.codigo}")
    dados = {
        "ok": True, "secao": s.id, "pagina": s.pagina, "titulo": s.titulo, "rota": rota,
        "agora": (f'Responda ao servidor que essa informação já está no painel, no card "{s.titulo}" da página '
                  f'"{s.pagina}", e pergunte se quer que você o leve até lá. Não repita os números: o resumo que '
                  "você enviou aparece no chat depois que ele responder."),
    }
    return dados, f"{s.titulo} · {s.pagina}"


def navegacao(escopo: Escopo, chamadas: list[Any]) -> dict[str, Any] | None:
    """A última chamada bem-sucedida de `apontar_no_painel` do turno vira o bloco `navegacao` da resposta."""
    for c in reversed(chamadas):
        if c.nome != FERRAMENTA or c.erro:
            continue
        try:
            s, rota = resolver(escopo, c.argumentos)
        except ValueError:
            return None
        resumo = str(c.argumentos.get("resumo") or "").strip()
        if not resumo:
            return None
        return {"secao": s.id, "pagina": s.pagina, "titulo": s.titulo, "rota": rota, "resumo": resumo}
    return None
