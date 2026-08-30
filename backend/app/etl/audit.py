"""Auditoria das bases da SME antes de qualquer carga.

Uso:  cd backend && python -m app.etl.audit   (escreve out/auditoria-dados.md e .json)

Cada verificação produz um *achado* com severidade:
  erro   -> quebra junção ou regra de negócio; precisa de tratamento na carga
  alerta -> precisa de decisão documentada (estimativa, exclusão, normalização)
  info   -> característica da base que vale registrar (e citar na banca)

Os números aqui são sobre a base ANONIMIZADA da SME: ordem de grandeza, não dado oficial.
"""
from __future__ import annotations

import gzip
import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

from . import readers as r

RIO_BBOX = {"lat_min": -23.10, "lat_max": -22.74, "lon_min": -43.80, "lon_max": -43.09}


@dataclass
class Achado:
    id: str
    area: str
    severidade: str  # erro | alerta | info
    titulo: str
    valor: str
    detalhe: str = ""
    tratamento: str = ""


@dataclass
class Relatorio:
    gerado_em: str
    duracao_s: float = 0.0
    metricas: dict = field(default_factory=dict)
    achados: list[Achado] = field(default_factory=list)

    def add(self, *a, **k):
        self.achados.append(Achado(*a, **k))


def out_dir() -> Path:
    env = os.environ.get("OUT_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[3] / "out"


# ----------------------------------------------------------------------------- nível de arquivo

def audit_arquivos(rel: Relatorio, base: Path) -> None:
    files = {
        "QueryA": base / "inscricoes" / "01_QueryA_InscricoesPorAno.csv.gz",
        "QueryB": base / "inscricoes" / "02_QueryB_RespostasSocioEconomicas.csv.gz",
        "QueryC": base / "inscricoes" / "03_QueryC_PerguntasComDescricao.csv",
        "QueryD": base / "inscricoes" / "04_UnidadesEscolaresComEndereco.csv",
    }
    for nome, p in files.items():
        opener = gzip.open if p.suffix == ".gz" else open
        with opener(p, "rb") as fh:
            head = fh.read(4096)
        bom = head.startswith(b"\xef\xbb\xbf")
        crlf = b"\r\n" in head
        first = head.split(b"\n", 1)[0].lstrip(b"\xef\xbb\xbf").decode("utf-8", "replace").rstrip("\r")
        sem_cabecalho = first.split(";")[0].strip().isdigit()
        rel.metricas.setdefault("arquivos", {})[nome] = {
            "bytes": p.stat().st_size, "bom": bom, "crlf": crlf, "sem_cabecalho": sem_cabecalho,
            "primeira_linha": first[:120],
        }
        if bom:
            rel.add(f"{nome}-bom", "arquivo", "alerta", f"{nome}: BOM UTF-8 no início",
                    "sim", "Sem `utf-8-sig`/leitor que ignore BOM, a 1ª coluna vira `\\ufeffano`.",
                    "DuckDB ignora o BOM; leitores pandas devem usar encoding='utf-8-sig'.")
        if crlf:
            rel.add(f"{nome}-crlf", "arquivo", "alerta", f"{nome}: quebras de linha CRLF",
                    "sim", "A última coluna recebe `\\r` grudado em leitores ingênuos; comparações falham em silêncio.",
                    "DuckDB detecta; além disso todas as strings recebem trim().")
        if sem_cabecalho:
            rel.add(f"{nome}-header", "arquivo", "erro", f"{nome}: arquivo SEM linha de cabeçalho",
                    first[:60], "Ler com header=True perde a primeira unidade e nomeia colunas com dados.",
                    "Lido com header=false e nomes explícitos (readers.QUERYD_COLS).")


# ----------------------------------------------------------------------------- QueryA

def audit_query_a(rel: Relatorio, con) -> None:
    q = lambda sql: con.execute(sql).fetchall()
    one = lambda sql: con.execute(sql).fetchone()[0]
    m = rel.metricas.setdefault("query_a", {})

    m["linhas"] = one("select count(*) from query_a")
    m["inscricoes"] = one("select count(distinct (prm_id, plm_id, ipl_id)) from query_a")
    m["criancas"] = one("select count(distinct aluno_anon) from query_a")
    m["unidades"] = one("select count(distinct unidade) from query_a")
    m["por_ano"] = {int(a): n for a, n in q("select ano, count(*) from query_a group by 1 order by 1")}

    # prm_id <-> ano
    mapa = q("select prm_id, ano, count(*) from query_a group by 1,2 order by 1")
    m["prm_ano"] = [(int(p), int(a), int(n)) for p, a, n in mapa]
    ruim = [(p, a) for p, a, _ in mapa if r.PROCESSOS.get(int(p)) != int(a)]
    rel.add("A-prm-ano", "QueryA", "erro" if ruim else "info", "Mapeamento prm_id → ano",
            "consistente" if not ruim else f"divergente: {ruim}",
            "; ".join(f"{p}→{a} ({n:,})" for p, a, n in mapa))

    # domínios (valores crus, para expor espaço/\r)
    raw_grup = q("select grupamento, count(*) from raw_a group by 1 order by 2 desc")
    m["grupamento_raw"] = [(repr(g), int(n)) for g, n in raw_grup]
    if any(g != g.strip() for g, _ in raw_grup):
        rel.add("A-grupamento-espaco", "QueryA", "alerta", "`grupamento` com espaço à direita no arquivo",
                ", ".join(repr(g) for g, _ in raw_grup if g != g.strip()),
                "Agrupar sem strip() cria categorias duplicadas.", "trim() no leitor.")
    for col, dom in (("situacao", r.SITUACOES), ("grupamento", r.GRUPAMENTOS), ("horario", r.HORARIOS)):
        vals = q(f"select {col}, count(*) from query_a group by 1 order by 2 desc")
        m[col] = {v: int(n) for v, n in vals}
        fora = [v for v, _ in vals if v not in dom]
        rel.add(f"A-dom-{col}", "QueryA", "erro" if fora else "info", f"Domínio de `{col}`",
                f"{len(vals)} valores" + (f"; fora do esperado: {fora}" if fora else ", todos esperados"),
                ", ".join(f"{v}={n:,}" for v, n in vals))
    rel.add("A-situacao-acento", "QueryA", "alerta", "`Cancelado na confirmacao` vem sem cedilha nem til",
            f"{m['situacao'].get('Cancelado na confirmacao', 0):,} linhas",
            "Filtrar por 'Cancelado na confirmação' (com acento) devolve zero linhas.",
            "Domínio canônico em readers.SITUACOES, exatamente como na base.")

    sexo = q("select sexo_crianca, count(*) from query_a group by 1 order by 2 desc")
    m["sexo"] = {s: int(n) for s, n in sexo}

    # opcao
    opc = q("select opcao, count(*) from query_a group by 1 order by 1")
    m["opcao"] = {int(o): int(n) for o, n in opc}
    n6 = sum(n for o, n in opc if o > 5)
    if n6:
        rel.add("A-opcao-6", "QueryA", "alerta", "Opções com ordem > 5", f"{n6} linhas",
                "A regra é até 5 opções; a 6ª aparece em pouquíssimas inscrições.",
                "Carregar como está; o motor aceita listas de qualquer tamanho.")
    dup = one("select count(*) from (select prm_id, plm_id, ipl_id, opcao, count(*) c from query_a group by all having c > 1)")
    rel.add("A-dup-chave", "QueryA", "erro" if dup else "info", "Duplicatas de (inscrição, opcao)", f"{dup:,}",
            tratamento="" if not dup else "Manter a 1ª ocorrência por data_criacao.")
    dup_un = one("""select count(*) from (select prm_id, plm_id, ipl_id, unidade, grupamento, horario, count(*) c
                    from query_a group by all having c > 1)""")
    if dup_un:
        rel.add("A-dup-unidade", "QueryA", "alerta", "Mesma unidade/grupamento/turno repetida na mesma inscrição",
                f"{dup_un:,} casos", "A família escolheu a mesma unidade em duas ordens.",
                "O motor ignora a repetição (mantém a 1ª ordem).")
    nop = q("select n, count(*) from (select prm_id, plm_id, ipl_id, count(*) n from query_a group by all) group by 1 order by 1")
    m["opcoes_por_inscricao"] = {int(a): int(b) for a, b in nop}

    # múltiplas inscrições da mesma criança no mesmo processo
    multi = one("""select count(*) from (select ano, aluno_anon, count(distinct (prm_id, plm_id, ipl_id)) k
                   from query_a group by all having k > 1)""")
    rel.add("A-crianca-multi-inscricao", "QueryA", "alerta", "Crianças com mais de uma inscrição no mesmo processo",
            f"{multi:,}", "Pode ser reinscrição legítima (fluxo contínuo) ou colisão nome+nascimento sem CPF/DNV/NIS "
            "(gap reconhecido pela SME).", "Cada inscrição é tratada como uma linha própria; a contagem por criança é aproximada.")
    reap = one("select count(*) from (select aluno_anon, count(distinct ano) k from query_a group by 1 having k > 1)")
    m["criancas_em_mais_de_um_ano"] = reap

    # nulos
    nul = q("""select count(*) filter (where cep is null), count(*) filter (where bairro is null),
                      count(*) filter (where data_criacao is null), count(*) filter (where nascimento_aluno_anomes is null),
                      count(*) filter (where unidade is null) from query_a""")[0]
    m["nulos"] = dict(zip(["cep", "bairro", "data_criacao", "nascimento", "unidade"], map(int, nul)))
    rel.add("A-nulos-endereco", "QueryA", "info", "CEP / bairro do responsável nulos",
            f"CEP {nul[0]:,} · bairro {nul[1]:,} ({100*nul[1]/m['linhas']:.1f}%)",
            tratamento="Sem endereço a distância não é calculável; a linha entra normalmente no motor.")
    cepfmt = one("select count(*) from query_a where cep is not null and not regexp_matches(cep, '^[0-9]{8}$')")
    if cepfmt:
        ex = [c for (c,) in q("select cep from query_a where cep is not null and not regexp_matches(cep, '^[0-9]{8}$') limit 5")]
        rel.add("A-cep-formato", "QueryA", "alerta", "CEP fora do formato de 8 dígitos", f"{cepfmt:,} linhas",
                f"Exemplos: {ex}", "Normalizar removendo não-dígitos; se não sobrar 8 dígitos, tratar como nulo.")

    # datas
    dr = q("""select ano, min(data_criacao), max(data_criacao),
                     count(*) filter (where year(data_criacao) > ano + 1) as depois
              from query_a group by 1 order by 1""")
    m["data_criacao_por_ano"] = [(int(a), str(mn), str(mx), int(d)) for a, mn, mx, d in dr]
    tarde = sum(d for *_, d in dr)
    rel.add("A-data-fora-janela", "QueryA", "alerta" if tarde else "info",
            "Inscrições criadas mais de um ano depois do processo",
            f"{tarde:,} linhas", "; ".join(f"{a}: {str(mn)[:10]} → {str(mx)[:10]}" for a, mn, mx, _ in dr),
            "O processo 2025 segue aberto (fluxo contínuo) — `data_criacao` chega a 2026. Não filtrar; só desempate usa a data.")

    # idade na data de referência (31/03 do ano do processo)
    idade = q("""select ano,
                        count(*) filter (where meses < 0) as neg,
                        count(*) filter (where meses > 47) as mais4,
                        count(*) filter (where meses is null) as nulo
                 from (select ano, datediff('month', try_strptime(nascimento_aluno_anomes || '-01', '%Y-%m-%d'),
                                            make_date(ano, 3, 31)) as meses from query_a) group by 1 order by 1""")
    m["idade_fora_faixa"] = [(int(a), int(n), int(m4), int(nu)) for a, n, m4, nu in idade]
    tot_fora = sum(n + m4 for _, n, m4, _ in idade)
    rel.add("A-idade", "QueryA", "alerta" if tot_fora else "info",
            "Idade fora de 0–47 meses em 31/03 do ano do processo",
            f"{tot_fora:,} linhas", "; ".join(f"{a}: <0m {n:,}, >47m {m4:,}, s/ nasc. {nu:,}" for a, n, m4, nu in idade),
            "Anonimização generaliza o nascimento para ano-mês; não usar idade para excluir, só como informação.")

    # grupamento vs idade (informativo)
    gi = q("""select grupamento, round(median(meses)) from (select grupamento,
                 datediff('month', try_strptime(nascimento_aluno_anomes || '-01', '%Y-%m-%d'), make_date(ano, 3, 31)) meses
                 from query_a) group by 1 order by 2""")
    m["idade_mediana_por_grupamento_meses"] = {g: int(v) for g, v in gi if v is not None}

    # múltiplos Confirmado
    mc = one("""select count(*) from (select prm_id, plm_id, ipl_id, count(*) filter (where situacao = 'Confirmado') c
                from query_a group by all having c > 1)""")
    rel.add("A-multi-confirmado", "QueryA", "alerta" if mc else "info",
            "Inscrições com mais de uma opção `Confirmado`", f"{mc:,}",
            "Deveria ser no máximo uma; o excesso vem de reprocessamento ou de colisão de identidade.",
            "Na estimativa de capacidade cada confirmação conta como vaga ocupada; para 'criança atendida' conta uma vez.")
    trans = one("select count(*) from query_a where situacao in ('Ativo','Selecionado','Selecionado da lista')")
    rel.add("A-estados-transitorios", "QueryA", "info", "Linhas em estado transitório (Ativo/Selecionado/Selecionado da lista)",
            f"{trans:,}", "Estados de processos já encerrados; não servem de amostra para durações.",
            "Excluídos de qualquer métrica de convocação.")


# ----------------------------------------------------------------------------- junções A ↔ D ↔ localização

def audit_unidades(rel: Relatorio, con) -> None:
    q = lambda sql: con.execute(sql).fetchall()
    one = lambda sql: con.execute(sql).fetchone()[0]
    m = rel.metricas.setdefault("unidades", {})

    m["queryd_linhas"] = one("select count(*) from query_d")
    nul_cod = one("select count(*) from query_d where esc_codigo is null")
    dup_cod = one("select count(*) from (select esc_codigo, count(*) c from query_d where esc_codigo is not null group by 1 having c > 1)")
    m["queryd_codigo_nulo"] = nul_cod
    m["queryd_codigo_duplicado"] = dup_cod
    rel.add("D-codigo-nulo", "QueryD", "alerta", "Unidades sem código (coluna 1 = NULL)", f"{nul_cod}",
            "A chave de junção com a QueryA é a coluna 1; sem ela a unidade não é referenciável.",
            "Mantidas na carga com código sintético `SEQ-<seq>`; nunca casam com inscrições.")
    if dup_cod:
        ex = q("select esc_codigo, count(*) from query_d where esc_codigo is not null group by 1 having count(*) > 1 order by 1 limit 5")
        rel.add("D-codigo-dup", "QueryD", "erro", "Códigos de unidade duplicados na QueryD", f"{dup_cod} códigos",
                f"Exemplos: {ex}", "Na carga fica a linha com endereço preenchido (ou a 1ª); as demais vão para o log.")
    sem_end = one("select count(*) from query_d where logradouro is null and bairro is null and cep is null")
    rel.add("D-sem-endereco", "QueryD", "info", "Unidades sem logradouro, bairro e CEP", f"{sem_end}",
            tratamento="Endereço vem então da planilha de localização (lat/long), quando existir.")
    tipo = q("select tipo, count(*) from query_d group by 1 order by 2 desc")
    m["queryd_tipo"] = {t: int(n) for t, n in tipo}

    # cobertura A -> D
    cov = q("""select count(distinct a.unidade), count(distinct d.esc_codigo)
               from query_a a left join query_d d on d.esc_codigo = a.unidade""")[0]
    m["cobertura_a_d"] = {"unidades_a": int(cov[0]), "casadas": int(cov[1])}
    rel.add("AD-join", "junção", "erro" if cov[1] < cov[0] else "info", "QueryA.unidade → QueryD.esc_codigo",
            f"{cov[1]}/{cov[0]} unidades casam", tratamento="Chave = coluna 1 da QueryD (não a coluna 0).")

    # cobertura A -> localização (lat/long)
    m["loc_linhas"] = one("select count(*) from unidades_loc")
    bruto = one("""select count(distinct l.designacao) from query_a a join unidades_loc l on l.designacao = a.unidade""")
    norm = one("""select count(distinct l.designacao) from query_a a join unidades_loc l on l.codigo_norm = a.unidade_norm""")
    rel.add("LOC-zero-esquerda", "localização", "erro", "Planilhas .xlsx perderam o zero à esquerda dos códigos de unidade",
            f"junção crua {bruto}/{m['cobertura_a_d']['unidades_a']} → normalizada {norm}",
            "QueryA usa '0734802'; a planilha traz 734802 (célula numérica). Junção literal casa só unidades sem zero.",
            "Toda tabela ganha `codigo_norm = ltrim(codigo, '0')`; é a chave entre CSV e xlsx. Lat/long, CRE e polo vêm por ela.")
    loc_nul = one("select count(*) from unidades_loc where latitude is null or longitude is null")
    loc_fora = one(f"""select count(*) from unidades_loc where latitude is not null and
                       (latitude < {RIO_BBOX['lat_min']} or latitude > {RIO_BBOX['lat_max']}
                        or longitude < {RIO_BBOX['lon_min']} or longitude > {RIO_BBOX['lon_max']})""")
    loc_dup = one("select count(*) from (select designacao, count(*) c from unidades_loc group by 1 having c > 1)")
    m["loc_sem_coordenada"] = loc_nul
    m["loc_fora_do_rio"] = loc_fora
    m["loc_designacao_duplicada"] = loc_dup
    rel.add("LOC-coord", "localização", "alerta" if (loc_nul or loc_fora) else "info",
            "Unidades sem coordenada ou fora da caixa do município",
            f"sem coordenada {loc_nul} · fora do Rio {loc_fora}",
            f"Caixa usada: lat {RIO_BBOX['lat_min']}…{RIO_BBOX['lat_max']}, lon {RIO_BBOX['lon_min']}…{RIO_BBOX['lon_max']}",
            "Coordenada inválida vira NULL; a unidade continua existindo, só não entra em cálculo de distância.")
    if loc_dup:
        rel.add("LOC-dup", "localização", "alerta", "Designações duplicadas na planilha de localização", f"{loc_dup}",
                tratamento="Fica a 1ª com coordenada válida.")
    cov2 = q("""select count(distinct a.unidade), count(distinct l.designacao)
                from query_a a left join unidades_loc l on l.codigo_norm = a.unidade_norm""")[0]
    m["cobertura_a_loc"] = {"unidades_a": int(cov2[0]), "com_latlong": int(cov2[1])}
    rel.add("ALOC-join", "junção", "alerta" if cov2[1] < cov2[0] else "info",
            "QueryA.unidade → planilha de localização (lat/long)",
            f"{cov2[1]}/{cov2[0]} unidades com coordenada",
            tratamento="Sem coordenada a unidade aparece no painel sem mapa; distância não calculada.")
    cov3 = q("""select count(distinct a.unidade), count(distinct p.designacao)
                from query_a a left join unidades_polo p on p.codigo_norm = a.unidade_norm""")[0]
    m["cobertura_a_polo"] = {"unidades_a": int(cov3[0]), "com_polo": int(cov3[1])}
    cre = q("""select l.cre, count(distinct a.unidade) from query_a a join unidades_loc l on l.codigo_norm = a.unidade_norm
               group by 1 order by 1""")
    m["unidades_por_cre"] = {str(c): int(n) for c, n in cre}


# ----------------------------------------------------------------------------- QueryB / QueryC

def audit_query_b_c(rel: Relatorio, con) -> None:
    q = lambda sql: con.execute(sql).fetchall()
    one = lambda sql: con.execute(sql).fetchone()[0]
    m = rel.metricas.setdefault("query_b", {})
    mc = rel.metricas.setdefault("query_c", {})

    m["linhas"] = one("select count(*) from query_b")
    leg = one("select count(*) from query_b where pergunta_legenda is not null")
    rel.add("B-legenda", "QueryB", "info", "`pergunta_legenda` preenchida", f"{leg:,} de {m['linhas']:,}",
            tratamento="Coluna descartada na carga.")
    for col in ("resposta", "confirmado"):
        vals = q(f"select {col}, count(*) from query_b group by 1 order by 2 desc")
        m[col] = {str(v): int(n) for v, n in vals}
        fora = [v for v, _ in vals if v not in ("Sim", "Nao")]
        rel.add(f"B-dom-{col}", "QueryB", "erro" if fora else "info", f"Domínio de `{col}`",
                ", ".join(f"{v}={n:,}" for v, n in vals), tratamento="Convertido para boolean (Sim → true).")
    dup = one("select count(*) from (select prm_id, plm_id, ipl_id, ich_perg_id, count(*) c from query_b group by all having c > 1)")
    rel.add("B-dup", "QueryB", "erro" if dup else "info", "Duplicatas de (inscrição, pergunta)", f"{dup:,}",
            tratamento="" if not dup else "Prevalece a linha com resposta 'Sim' (a mais favorável à família) e o último confirmado.")

    orf = one("""select count(*) from query_b b left join (select distinct prm_id, plm_id, ipl_id from query_a) a
                 using (prm_id, plm_id, ipl_id) where a.prm_id is null""")
    sem = one("""select count(*) from (select distinct prm_id, plm_id, ipl_id from query_a) a
                 left join (select distinct prm_id, plm_id, ipl_id from query_b) b using (prm_id, plm_id, ipl_id)
                 where b.prm_id is null""")
    m["respostas_orfas"] = orf
    m["inscricoes_sem_resposta"] = sem
    rel.add("AB-orfas", "junção", "alerta" if orf else "info", "Respostas sem inscrição correspondente (QueryB → QueryA)",
            f"{orf:,}", tratamento="Descartadas na carga (FK).")
    rel.add("AB-sem-resposta", "junção", "alerta", "Inscrições sem nenhuma resposta ao questionário",
            f"{sem:,} ({100*sem/rel.metricas['query_a']['inscricoes']:.1f}%)",
            "Sem respostas a pontuação é 0 — a criança concorre só pelo desempate.",
            "Carregadas com pontuacao = 0 e marcadas no painel.")

    # B -> C
    bc = one("""select count(*) from query_b b left join query_c c using (ano, ich_perg_id) where c.ano is null""")
    rel.add("BC-join", "junção", "erro" if bc else "info", "QueryB → QueryC por (ano, ich_perg_id)",
            f"{bc:,} respostas sem pergunta na régua do ano",
            tratamento="Junção sempre por (ano, ich_perg_id); nunca por perg_id sozinho.")

    # C: régua
    mc["linhas"] = one("select count(*) from query_c")
    por_ano = q("select ano, count(*), sum(perg_pontuacao), count(*) filter (where criterio_desempate) from query_c group by 1 order by 1")
    mc["por_ano"] = [(int(a), int(n), int(s), int(d)) for a, n, s, d in por_ano]
    rel.add("C-regua", "QueryC", "info", "Régua por ano: perguntas · soma dos pesos · nº de desempates",
            "; ".join(f"{a}: {n} perg, Σ={s}, {d} desemp." for a, n, s, d in por_ano),
            "A régua muda todo ano. A do dataset (até proc. 195/2025) NÃO é a da Res. 542/2025 (2026).",
            "Tabela `pergunta` com chave (ano, ich_perg_id); o motor recebe a régua do ano.")
    crit = q("select perg_criterio_raw, count(*) from query_c group by 1")
    mc["perg_criterio_raw"] = {str(v): int(n) for v, n in crit}
    zero_nao_crit = one("select count(*) from query_c where perg_pontuacao = 0 and not criterio_desempate")
    if zero_nao_crit:
        rel.add("C-zero", "QueryC", "alerta", "Perguntas com pontuação 0 que não são desempate", f"{zero_nao_crit}",
                tratamento="Carregadas; não afetam a ordenação.")
    top = q("""select ano, perg_id, perg_pontuacao, pergunta_texto from query_c
               where perg_pontuacao = (select max(perg_pontuacao) from query_c c2 where c2.ano = query_c.ano) order by 1, 2""")
    mc["maior_peso_por_ano"] = [(int(a), int(p), int(v), t[:70]) for a, p, v, t in top]

    # confirmado: ruído a partir de 2022
    conf = q("""select b.ano,
                       100.0 * count(*) filter (where b.confirmado = 'Sim' and b.resposta = 'Sim') / nullif(count(*) filter (where b.resposta = 'Sim'), 0),
                       100.0 * count(*) filter (where b.confirmado = 'Sim' and b.resposta = 'Nao') / nullif(count(*) filter (where b.resposta = 'Nao'), 0)
                from query_b b join query_c c using (ano, ich_perg_id) where c.perg_pontuacao > 0 group by 1 order by 1""")
    m["confirmado_pct_sim_vs_nao"] = [(int(a), round(float(s or 0), 1), round(float(n or 0), 1)) for a, s, n in conf]
    rel.add("B-confirmado-ruido", "QueryB", "alerta", "`confirmado` deixa de discriminar Sim/Não a partir de 2022",
            "; ".join(f"{a}: Sim {s}% · Não {n}%" for a, s, n in m["confirmado_pct_sim_vs_nao"]),
            "Em 2021 quem respondeu Sim é confirmado ~3× mais; de 2022 em diante a taxa é igual — o campo virou ruído "
            "(validação passou a ser feita no RMI e não volta para a coluna).",
            "A pontuação é calculada sobre `resposta`, não sobre `confirmado`. `confirmado` é carregado só para referência.")


# ----------------------------------------------------------------------------- oferta / ocupação / nascidos

def audit_oferta(rel: Relatorio, con) -> None:
    q = lambda sql: con.execute(sql).fetchall()
    m = rel.metricas.setdefault("ocupacao", {})

    por_ano = q("""select ano, count(distinct designacao), sum(valor) filter (where medida='aluno'),
                          count(*) filter (where horario is null and medida='aluno')
                   from ocupacao group by 1 order by 1""")
    m["por_ano"] = [(int(a), int(u), int(al or 0), int(st)) for a, u, al, st in por_ano]
    rel.add("OC-layout", "ocupação", "alerta", "Layout das planilhas de ocupação muda por ano",
            "; ".join(f"{a}: {u} unid., {al:,} alunos" + (" (sem turno)" if st else "") for a, u, al, st in m["por_ano"]),
            "2021 usa TP/TU; 2022 não separa turno; 2023+ usa Integral/Parcial. Nomes de coluna e linhas de cabeçalho variam.",
            "Leitor detecta a linha 'Aluno' e normaliza grupamento/turno; 2022 fica com horario NULL.")
    grup = q("select grupamento, count(*) from ocupacao group by 1 order by 2 desc")
    m["grupamentos"] = {str(g): int(n) for g, n in grup}
    fora = [g for g, _ in grup if g not in r.GRUPAMENTOS]
    if fora:
        rel.add("OC-grupamento", "ocupação", "alerta", "Grupamentos não normalizados na ocupação", f"{fora}",
                tratamento="Revisar mapeamento em readers.load_total_alunos.")
    cov = q("""select count(distinct a.unidade), count(distinct o.designacao)
               from query_a a left join (select distinct codigo_norm as designacao from ocupacao) o on o.designacao = a.unidade_norm""")[0]
    m["cobertura_a_ocupacao"] = {"unidades_a": int(cov[0]), "com_ocupacao": int(cov[1])}
    rel.add("AOC-join", "junção", "info", "QueryA.unidade → planilhas de ocupação", f"{cov[1]}/{cov[0]} unidades",
            "Ocupação ≠ oferta: a base não traz vagas ofertadas por processo.",
            "Capacidade do motor é ESTIMADA pelo nº de Confirmado por unidade/grupamento/turno/ano (fonte = estimada_confirmados).")

    # capacidade estimada
    cap = q("""select ano, count(*), sum(c), min(c), median(c), max(c) from
               (select ano, unidade, grupamento, horario, count(*) c from query_a where situacao = 'Confirmado' group by all)
               group by 1 order by 1""")
    m["capacidade_estimada_por_ano"] = [(int(a), int(n), int(s), int(mn), float(md), int(mx)) for a, n, s, mn, md, mx in cap]
    rel.add("CAP-estimada", "capacidade", "alerta", "Capacidade estimada (nº de Confirmado) por unidade/grupamento/turno",
            "; ".join(f"{a}: {n} turmas-alvo, {s:,} vagas, mediana {md:.0f}" for a, n, s, *_, md, _ in [(x[0], x[1], x[2], x[3], x[4], x[5]) for x in m["capacidade_estimada_por_ano"]]),
            "É um piso: vagas que ficaram vazias não aparecem. Otimizar sobre capacidade estimada é otimizar sobre número incerto.",
            "Marcada como `estimada_confirmados`; a unidade pode informar o número real (fonte = informada).")

    # nascidos vivos
    nv = q("select ano, sum(nascidos), count(distinct bairro) from nascidos_vivos group by 1 order by 1")
    rel.metricas["nascidos_vivos"] = {"por_ano": [(int(a), int(s), int(b)) for a, s, b in nv]}
    rel.add("NV-total", "nascidos vivos", "alerta", "Planilha traz linha 'Total' e bairros 'IGNORADO'/'EM BRANCO'",
            "; ".join(f"{a}: {s:,}" for a, s, _ in nv[:5]) + " …",
            "Sem excluir a linha Total, toda soma dobra. 2026 é parcial.",
            "Linha Total excluída no leitor; 'IGNORADO'/'EM BRANCO' mantidos e sinalizados.")


# ----------------------------------------------------------------------------- relatório

def escrever(rel: Relatorio, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "auditoria-dados.json").write_text(
        json.dumps(asdict(rel), ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    sev_ord = {"erro": 0, "alerta": 1, "info": 2}
    achados = sorted(rel.achados, key=lambda a: (sev_ord[a.severidade], a.area, a.id))
    n = {s: sum(1 for a in rel.achados if a.severidade == s) for s in sev_ord}
    L = []
    L.append("# Auditoria das bases da SME\n")
    L.append(f"Gerada em {rel.gerado_em} por `backend/app/etl/audit.py` em {rel.duracao_s:.0f} s. "
             "Base anonimizada: **ordem de grandeza, não número oficial**.\n")
    L.append(f"**{n['erro']} erros · {n['alerta']} alertas · {n['info']} informações.** "
             "Erro = quebra junção/regra; alerta = exige decisão (documentada na coluna Tratamento); info = característica a registrar.\n")
    ma, mu, mb, mc = rel.metricas["query_a"], rel.metricas["unidades"], rel.metricas["query_b"], rel.metricas["query_c"]
    L.append("## Resumo\n")
    L.append("| Métrica | Valor |\n|---|---:|")
    L.append(f"| Opções (QueryA) | {ma['linhas']:,} |")
    L.append(f"| Inscrições | {ma['inscricoes']:,} |")
    L.append(f"| Crianças distintas | {ma['criancas']:,} |")
    L.append(f"| Crianças em mais de um processo | {ma['criancas_em_mais_de_um_ano']:,} |")
    L.append(f"| Unidades com inscrição | {ma['unidades']} |")
    L.append(f"| … com lat/long | {mu['cobertura_a_loc']['com_latlong']} |")
    L.append(f"| … com polo/CRE | {mu['cobertura_a_polo']['com_polo']} |")
    L.append(f"| Respostas (QueryB) | {mb['linhas']:,} |")
    L.append(f"| Perguntas na régua (QueryC) | {mc['linhas']} |")
    L.append("")
    L.append("## Achados\n")
    L.append("| Sev. | Área | Achado | Valor | Detalhe | Tratamento |\n|---|---|---|---|---|---|")
    for a in achados:
        esc = lambda s: str(s).replace("|", "\\|").replace("\n", " ")
        L.append(f"| **{a.severidade}** | {a.area} | {esc(a.titulo)} | {esc(a.valor)} | {esc(a.detalhe)} | {esc(a.tratamento)} |")
    L.append("")
    L.append("## Métricas detalhadas\n")
    L.append("### Opções por ano\n")
    L.append("| Ano | Opções |\n|---|---:|")
    for a, v in ma["por_ano"].items():
        L.append(f"| {a} | {v:,} |")
    L.append("\n### Opções por inscrição\n")
    L.append("| Nº de opções | Inscrições |\n|---|---:|")
    for k, v in ma["opcoes_por_inscricao"].items():
        L.append(f"| {k} | {v:,} |")
    L.append("\n### `situacao`\n")
    L.append("| Situação | Linhas |\n|---|---:|")
    for k, v in ma["situacao"].items():
        L.append(f"| `{k}` | {v:,} |")
    L.append("\n### Régua por ano (maior peso)\n")
    L.append("| Ano | perg_id | Pontos | Pergunta |\n|---|---|---:|---|")
    for a, p, v, t in mc["maior_peso_por_ano"]:
        L.append(f"| {a} | {p} | {v} | {t} |")
    L.append("\n### Capacidade estimada (Confirmado por unidade/grupamento/turno)\n")
    L.append("| Ano | Turmas-alvo | Vagas (soma) | mín | mediana | máx |\n|---|---:|---:|---:|---:|---:|")
    for a, n_, s, mn, md, mx in rel.metricas["ocupacao"]["capacidade_estimada_por_ano"]:
        L.append(f"| {a} | {n_:,} | {s:,} | {mn} | {md:.0f} | {mx} |")
    L.append("\n### `confirmado` — % confirmadas entre respostas Sim vs Não (perguntas com peso > 0)\n")
    L.append("| Ano | Sim | Não |\n|---|---:|---:|")
    for a, s, n_ in mb["confirmado_pct_sim_vs_nao"]:
        L.append(f"| {a} | {s}% | {n_}% |")
    L.append("\n### Ocupação (planilhas) por ano\n")
    L.append("| Ano | Unidades | Alunos | Linhas sem turno |\n|---|---:|---:|---:|")
    for a, u, al, st in rel.metricas["ocupacao"]["por_ano"]:
        L.append(f"| {a} | {u} | {al:,} | {st} |")
    L.append("\n### Nascidos vivos por ano (linha Total excluída)\n")
    L.append("| Ano | Nascidos | Bairros |\n|---|---:|---:|")
    for a, s, b in rel.metricas["nascidos_vivos"]["por_ano"]:
        L.append(f"| {a} | {s:,} | {b} |")
    L.append("\n### Unidades com inscrição por CRE\n")
    L.append("| CRE | Unidades |\n|---|---:|")
    for c, n_ in mu["unidades_por_cre"].items():
        L.append(f"| {c} | {n_} |")
    L.append("")
    (dest / "auditoria-dados.md").write_text("\n".join(L), encoding="utf-8")


def main() -> int:
    t0 = time.time()
    base = r.data_dir()
    rel = Relatorio(gerado_em=datetime.now().strftime("%Y-%m-%d %H:%M"))
    print(f"[audit] dados em {base}")
    audit_arquivos(rel, base)
    con = r.connect()
    print("[audit] carregando bases com DuckDB…")
    r.load_all(con, base)
    print("[audit] QueryA…");        audit_query_a(rel, con)
    print("[audit] unidades…");      audit_unidades(rel, con)
    print("[audit] QueryB/C…");      audit_query_b_c(rel, con)
    print("[audit] oferta/nascidos…"); audit_oferta(rel, con)
    rel.duracao_s = time.time() - t0
    dest = out_dir()
    escrever(rel, dest)
    n = {s: sum(1 for a in rel.achados if a.severidade == s) for s in ("erro", "alerta", "info")}
    print(f"[audit] {n} → {dest/'auditoria-dados.md'} ({rel.duracao_s:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
