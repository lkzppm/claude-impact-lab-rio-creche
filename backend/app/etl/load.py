"""Carga do PostgreSQL a partir das bases da SME (data/), via DuckDB.

Uso:  cd backend && python -m app.etl.load [--anos 2024,2025] [--database-url ...]

Idempotente: TRUNCATE ... CASCADE nas tabelas de domínio e recarga completa. Rodadas, convocações e
eventos (tabelas de operação) também são zerados, porque referenciam ids de inscrição que mudam.

Decisões (todas registradas em out/auditoria-dados.md):
- `unidade.codigo` é o código COMO ESTÁ NA QueryA (com zero à esquerda). As planilhas xlsx casam por
  `codigo_norm = ltrim(codigo, '0')`.
- `inscricao.pontuacao` = Σ pontos das perguntas respondidas 'Sim' na régua do ANO daquela inscrição.
  `confirmado` é carregado só para referência (é ruído desde 2022).
- `capacidade` = nº de opções `Confirmado` por (ano, unidade, grupamento, turno), fonte
  'estimada_confirmados'. É um piso; a base não traz vagas ofertadas.
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time
from pathlib import Path

import psycopg

from . import readers as r

RIO_BBOX = (-23.10, -22.74, -43.80, -43.09)  # lat_min, lat_max, lon_min, lon_max


def _pg_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        try:
            from app.config import get_settings  # type: ignore
            url = get_settings().database_url
        except Exception:
            url = "postgresql+psycopg://creche:creche@localhost:5432/creche"
    return url.replace("postgresql+psycopg://", "postgresql://")


# ----------------------------------------------------------------------------- DuckDB: tabelas de carga

def preparar(con, anos: list[int] | None) -> dict[str, int]:
    filtro = f"WHERE ano IN ({','.join(map(str, anos))})" if anos else ""

    con.execute(f"CREATE OR REPLACE TABLE a AS SELECT * FROM query_a {filtro}")
    con.execute(f"CREATE OR REPLACE TABLE b AS SELECT * FROM query_b {filtro}")
    con.execute(f"CREATE OR REPLACE TABLE c AS SELECT * FROM query_c {filtro}")

    # processo / pergunta
    con.execute("""CREATE OR REPLACE TABLE ld_processo AS
        SELECT DISTINCT ano, prm_id, 'Processo ' || prm_id || '/' || ano AS descricao FROM a ORDER BY ano""")
    con.execute("""CREATE OR REPLACE TABLE ld_pergunta AS
        SELECT ano, ich_perg_id, perg_id, pergunta_texto AS texto, perg_pontuacao AS pontuacao,
               criterio_desempate, perg_ordem AS ordem
        FROM c WHERE ano IN (SELECT ano FROM ld_processo)""")

    # unidade: 872 da QueryA (código canônico) + demais da QueryD, enriquecidas por codigo_norm
    con.execute("""CREATE OR REPLACE TABLE ld_unidade AS
        WITH base AS (
            SELECT unidade AS codigo, unidade_norm AS codigo_norm, any_value(nome_unidade) AS nome_a
            FROM query_a GROUP BY 1, 2
        ),
        d AS (   -- QueryD deduplicada: prefere linha com endereço; código nulo vira SEQ-<seq>
            SELECT * FROM (
                SELECT coalesce(esc_codigo, 'SEQ-' || seq) AS esc_codigo,
                       coalesce(codigo_norm, 'SEQ-' || seq) AS codigo_norm, nome, tipo, logradouro, numero, bairro, cep,
                       row_number() OVER (PARTITION BY coalesce(codigo_norm, 'SEQ-' || seq)
                                          ORDER BY (logradouro IS NOT NULL) DESC, seq) AS rn
                FROM query_d) WHERE rn = 1
        ),
        loc AS (
            SELECT * FROM (
                SELECT codigo_norm, cre, microarea, denominacao, bairro, tipo,
                       CASE WHEN latitude BETWEEN -23.10 AND -22.74 AND longitude BETWEEN -43.80 AND -43.09
                            THEN latitude END AS lat,
                       CASE WHEN latitude BETWEEN -23.10 AND -22.74 AND longitude BETWEEN -43.80 AND -43.09
                            THEN longitude END AS lon,
                       row_number() OVER (PARTITION BY codigo_norm ORDER BY (latitude IS NOT NULL) DESC) AS rn
                FROM unidades_loc) WHERE rn = 1
        ),
        polo AS (
            SELECT * FROM (SELECT codigo_norm, polo, microarea AS microarea_p, cre AS cre_p,
                                  row_number() OVER (PARTITION BY codigo_norm ORDER BY polo) AS rn
                           FROM unidades_polo WHERE codigo_norm IS NOT NULL) WHERE rn = 1
        ),
        todos AS (
            SELECT codigo, codigo_norm, nome_a FROM base
            UNION ALL
            SELECT d.esc_codigo, d.codigo_norm, NULL FROM d
            WHERE d.codigo_norm NOT IN (SELECT codigo_norm FROM base)
        )
        SELECT t.codigo,
               coalesce(t.nome_a, d.nome, loc.denominacao)            AS nome,
               coalesce(loc.tipo, d.tipo)                             AS tipo,
               d.logradouro, d.numero,
               coalesce(d.bairro, loc.bairro)                         AS bairro,
               d.cep,
               coalesce(loc.cre, polo.cre_p)                          AS cre,
               coalesce(loc.microarea, polo.microarea_p)              AS microarea,
               polo.polo,
               loc.lat, loc.lon
        FROM todos t
        LEFT JOIN d    ON d.codigo_norm = t.codigo_norm
        LEFT JOIN loc  ON loc.codigo_norm = t.codigo_norm
        LEFT JOIN polo ON polo.codigo_norm = t.codigo_norm""")

    # inscricao (id atribuído aqui; ordem estável por chave da SME)
    con.execute("""CREATE OR REPLACE TABLE ld_inscricao AS
        WITH ins AS (
            SELECT ano, prm_id, plm_id, ipl_id,
                   any_value(aluno_anon) AS aluno_anon, any_value(responsavel_anon) AS responsavel_anon,
                   any_value(nascimento_aluno_anomes) AS nascimento_anomes, any_value(sexo_crianca) AS sexo,
                   any_value(cep) AS cep, any_value(bairro) AS bairro, min(data_criacao) AS data_criacao
            FROM a GROUP BY 1, 2, 3, 4
        ),
        pts AS (
            SELECT b.prm_id, b.plm_id, b.ipl_id, sum(c.perg_pontuacao) AS pontuacao
            FROM b JOIN c USING (ano, ich_perg_id)
            WHERE b.resposta = 'Sim' AND c.perg_pontuacao > 0 AND NOT c.criterio_desempate
            GROUP BY 1, 2, 3
        )
        SELECT row_number() OVER (ORDER BY ins.ano, ins.prm_id, ins.plm_id, ins.ipl_id) AS id,
               ins.*, coalesce(pts.pontuacao, 0) AS pontuacao
        FROM ins LEFT JOIN pts USING (prm_id, plm_id, ipl_id)""")

    con.execute("""CREATE OR REPLACE TABLE ld_opcao AS
        SELECT row_number() OVER (ORDER BY i.id, a.opcao) AS id, i.id AS inscricao_id, a.opcao AS ordem,
               a.unidade AS unidade_codigo, a.grupamento, a.horario, a.situacao AS situacao_origem
        FROM a JOIN ld_inscricao i USING (prm_id, plm_id, ipl_id)""")

    con.execute("""CREATE OR REPLACE TABLE ld_resposta AS
        SELECT i.id AS inscricao_id, b.ich_perg_id,
               (b.resposta = 'Sim') AS resposta, (b.confirmado = 'Sim') AS confirmado
        FROM b JOIN ld_inscricao i USING (prm_id, plm_id, ipl_id)
        JOIN c ON c.ano = b.ano AND c.ich_perg_id = b.ich_perg_id""")

    con.execute("""CREATE OR REPLACE TABLE ld_capacidade AS
        SELECT ano, unidade AS unidade_codigo, grupamento, horario, count(*) AS vagas,
               'estimada_confirmados' AS fonte
        FROM a WHERE situacao = 'Confirmado' GROUP BY 1, 2, 3, 4""")

    return {t: con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            for t in ("ld_processo", "ld_pergunta", "ld_unidade", "ld_inscricao", "ld_opcao", "ld_resposta", "ld_capacidade")}


# ----------------------------------------------------------------------------- Postgres: COPY

TABELAS = [  # (tabela pg, tabela duckdb, colunas)
    ("processo",   "ld_processo",   "ano, prm_id, descricao"),
    ("pergunta",   "ld_pergunta",   "ano, ich_perg_id, perg_id, texto, pontuacao, criterio_desempate, ordem"),
    ("unidade",    "ld_unidade",    "codigo, nome, tipo, logradouro, numero, bairro, cep, cre, microarea, polo, lat, lon"),
    ("inscricao",  "ld_inscricao",  "id, ano, prm_id, plm_id, ipl_id, aluno_anon, responsavel_anon, nascimento_anomes, sexo, cep, bairro, data_criacao, pontuacao"),
    ("opcao",      "ld_opcao",      "id, inscricao_id, ordem, unidade_codigo, grupamento, horario, situacao_origem"),
    ("resposta",   "ld_resposta",   "inscricao_id, ich_perg_id, resposta, confirmado"),
    ("capacidade", "ld_capacidade", "ano, unidade_codigo, grupamento, horario, vagas, fonte"),
]
OPERACAO = ["comprovacao", "evento", "convocacao", "alocacao", "rodada"]


def copiar(con, pg: psycopg.Connection, tmp: Path) -> None:
    with pg.cursor() as cur:
        cur.execute("TRUNCATE " + ", ".join(OPERACAO + [t for t, _, _ in TABELAS]) + " RESTART IDENTITY CASCADE")
        for tabela, ld, cols in TABELAS:
            t0 = time.time()
            f = tmp / f"{tabela}.csv"
            con.execute(f"COPY (SELECT {cols} FROM {ld} ORDER BY 1) TO '{f}' (FORMAT csv, HEADER false, DELIMITER ',', QUOTE '\"')")
            with cur.copy(f"COPY {tabela} ({cols}) FROM STDIN WITH (FORMAT csv)") as cp, open(f, "rb") as fh:
                while chunk := fh.read(1 << 20):
                    cp.write(chunk)
            print(f"[load]   {tabela:<11} {time.time()-t0:5.1f}s")
        for t in ("inscricao", "opcao"):
            cur.execute(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), coalesce(max(id), 1)) FROM {t}")
        cur.execute("ANALYZE")
    pg.commit()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--anos", help="lista separada por vírgula, ex.: 2024,2025 (padrão: todos)")
    ap.add_argument("--database-url", default=None)
    args = ap.parse_args(argv)
    anos = [int(x) for x in args.anos.split(",")] if args.anos else None
    url = (args.database_url or _pg_url()).replace("postgresql+psycopg://", "postgresql://")

    t0 = time.time()
    con = r.connect()
    print(f"[load] lendo {r.data_dir()} …")
    r.load_query_a(con); r.load_query_b(con); r.load_query_c(con); r.load_query_d(con); r.load_unidades_localizacao(con)
    print(f"[load] preparando tabelas (anos={anos or 'todos'}) …")
    n = preparar(con, anos)
    for k, v in n.items():
        print(f"[load]   {k:<14} {v:>10,}")
    with tempfile.TemporaryDirectory(prefix="creche-load-") as tmp, psycopg.connect(url) as pg:
        print(f"[load] copiando para {url.split('@')[-1]} …")
        copiar(con, pg, Path(tmp))
        with pg.cursor() as cur:
            cur.execute("""SELECT (SELECT count(*) FROM inscricao), (SELECT count(*) FROM opcao),
                                  (SELECT count(*) FROM resposta), (SELECT count(*) FROM unidade),
                                  (SELECT count(*) FROM capacidade)""")
            ins, opc, resp, uni, cap = (f"{x:,}" for x in cur.fetchone())
            print(f"[load] no Postgres: inscricao={ins} opcao={opc} resposta={resp} unidade={uni} capacidade={cap}")
    print(f"[load] concluído em {time.time()-t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
