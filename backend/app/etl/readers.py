"""Leitura robusta das bases da SME (data/) com DuckDB.

Cada função registra uma view/tabela saneada na conexão DuckDB recebida e devolve o nome.
As armadilhas conhecidas (spec/03) são tratadas aqui, uma única vez:

- BOM no início dos CSV               -> DuckDB ignora; conferimos no audit
- CRLF em todas as linhas             -> DuckDB detecta; strings recebem trim() de qualquer forma
- QueryD sem cabeçalho                -> header=false + names explícitos
- `grupamento` com espaço à direita   -> trim()
- `Cancelado na confirmacao` sem acento -> mantido como está; o domínio canônico está em SITUACOES
- `NULL` literal como texto           -> nullstr='NULL'
- QueryC: `perg_criterio` vem 'Sim'/'Não' com acento -> normalizado para bool
- Planilhas .xlsx perderam o ZERO À ESQUERDA dos códigos de unidade ('0734802' -> '734802')
  -> toda tabela ganha `codigo_norm = ltrim(codigo, '0')`, a chave de junção entre bases

Nada aqui escreve em data/.
"""
from __future__ import annotations

import os
from pathlib import Path

import duckdb
import pandas as pd

# Domínio canônico de `situacao` exatamente como está na base (sem cedilha/til em "confirmacao").
SITUACOES = (
    "Ativo",
    "Selecionado",
    "Selecionado da lista",
    "Confirmado",
    "Lista de espera",
    "Cancelado",
    "Cancelado na confirmacao",
    "Cancelado pelo sistema",
)
GRUPAMENTOS = ("Berçário", "Maternal I", "Maternal II")
HORARIOS = ("Integral", "Parcial")
# prm_id -> ano, segundo spec/03
PROCESSOS = {179: 2021, 181: 2022, 184: 2023, 194: 2024, 195: 2025}

QUERYD_COLS = [
    "seq", "esc_codigo", "nome", "tipo", "logradouro", "numero", "complemento", "bairro", "cep",
]


def data_dir() -> Path:
    env = os.environ.get("DATA_DIR")
    if env:
        return Path(env)
    # backend/app/etl/readers.py -> raiz do repo -> data/
    return Path(__file__).resolve().parents[3] / "data"


def connect(database: str = ":memory:") -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database)
    con.execute("SET preserve_insertion_order = false")
    return con


# --------------------------------------------------------------------------- CSV (inscrições)

def load_query_a(con: duckdb.DuckDBPyConnection, base: Path | None = None) -> str:
    """QueryA: uma linha por opção de creche escolhida (837.179 linhas)."""
    p = (base or data_dir()) / "inscricoes" / "01_QueryA_InscricoesPorAno.csv.gz"
    con.execute(
        f"""
        CREATE OR REPLACE TABLE raw_a AS
        SELECT * FROM read_csv('{p}', delim=';', header=true, nullstr='NULL',
                               all_varchar=true, sample_size=-1)
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TABLE query_a AS
        SELECT
            CAST(ano AS INTEGER)                      AS ano,
            CAST(prm_id AS INTEGER)                   AS prm_id,
            CAST(plm_id AS INTEGER)                   AS plm_id,
            CAST(ipl_id AS INTEGER)                   AS ipl_id,
            CAST(opcao AS INTEGER)                    AS opcao,
            trim(unidade)                             AS unidade,
            ltrim(trim(unidade), '0')                 AS unidade_norm,
            trim(nome_unidade)                        AS nome_unidade,
            trim(grupamento)                          AS grupamento,
            trim(horario)                             AS horario,
            TRY_CAST(data_criacao AS TIMESTAMP)       AS data_criacao,
            trim(aluno_anon)                          AS aluno_anon,
            trim(sexo_crianca)                        AS sexo_crianca,
            trim(nascimento_aluno_anomes)             AS nascimento_aluno_anomes,
            trim(responsavel_anon)                    AS responsavel_anon,
            nullif(trim("CEP"), '')                   AS cep,
            nullif(trim(bairro), '')                  AS bairro,
            trim(situacao)                            AS situacao
        FROM raw_a
        """
    )
    return "query_a"


def load_query_b(con: duckdb.DuckDBPyConnection, base: Path | None = None) -> str:
    """QueryB: uma linha por pergunta respondida (4.357.119 linhas)."""
    p = (base or data_dir()) / "inscricoes" / "02_QueryB_RespostasSocioEconomicas.csv.gz"
    con.execute(
        f"""
        CREATE OR REPLACE TABLE raw_b AS
        SELECT * FROM read_csv('{p}', delim=';', header=true, nullstr='NULL',
                               all_varchar=true, sample_size=-1)
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TABLE query_b AS
        SELECT
            CAST(ano AS INTEGER)            AS ano,
            CAST(prm_id AS INTEGER)         AS prm_id,
            CAST(plm_id AS INTEGER)         AS plm_id,
            CAST(ipl_id AS INTEGER)         AS ipl_id,
            CAST(ich_perg_id AS INTEGER)    AS ich_perg_id,
            trim(pergunta_texto)            AS pergunta_texto,
            pergunta_legenda,
            TRY_CAST(pergunta_ordem AS INTEGER) AS pergunta_ordem,
            trim(resposta)                  AS resposta,
            trim(confirmado)                AS confirmado
        FROM raw_b
        """
    )
    return "query_b"


def load_query_c(con: duckdb.DuckDBPyConnection, base: Path | None = None) -> str:
    """QueryC: a régua de pontuação de cada processo (65 linhas)."""
    p = (base or data_dir()) / "inscricoes" / "03_QueryC_PerguntasComDescricao.csv"
    con.execute(
        f"""
        CREATE OR REPLACE TABLE raw_c AS
        SELECT * FROM read_csv('{p}', delim=';', header=true, nullstr='NULL',
                               all_varchar=true, sample_size=-1)
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TABLE query_c AS
        SELECT
            CAST(ano AS INTEGER)                        AS ano,
            CAST(prm_id AS INTEGER)                     AS prm_id,
            CAST(ich_perg_id AS INTEGER)                AS ich_perg_id,
            CAST(perg_id AS INTEGER)                    AS perg_id,
            trim(pergunta_texto)                        AS pergunta_texto,
            pergunta_legenda,
            TRY_CAST("perg_ordemVisualizacao" AS INTEGER) AS perg_ordem,
            CAST(perg_pontuacao AS INTEGER)             AS perg_pontuacao,
            (lower(trim(perg_criterio)) = 'sim')        AS criterio_desempate,
            trim(perg_criterio)                         AS perg_criterio_raw
        FROM raw_c
        """
    )
    return "query_c"


def load_query_d(con: duckdb.DuckDBPyConnection, base: Path | None = None) -> str:
    """QueryD: unidades escolares com endereço (2.188 linhas, SEM cabeçalho)."""
    p = (base or data_dir()) / "inscricoes" / "04_UnidadesEscolaresComEndereco.csv"
    names = ", ".join(f"'{c}'" for c in QUERYD_COLS)
    con.execute(
        f"""
        CREATE OR REPLACE TABLE raw_d AS
        SELECT * FROM read_csv('{p}', delim=';', header=false, names=[{names}],
                               nullstr='NULL', all_varchar=true, sample_size=-1)
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TABLE query_d AS
        SELECT
            CAST(seq AS INTEGER)          AS seq,
            nullif(trim(esc_codigo), '')  AS esc_codigo,
            ltrim(nullif(trim(esc_codigo), ''), '0') AS codigo_norm,
            trim(nome)                    AS nome,
            trim(tipo)                    AS tipo,
            nullif(trim(logradouro), '')  AS logradouro,
            nullif(trim(numero), '')      AS numero,
            nullif(trim(complemento), '') AS complemento,
            nullif(trim(bairro), '')      AS bairro,
            nullif(trim(cep), '')         AS cep
        FROM raw_d
        """
    )
    return "query_d"


# --------------------------------------------------------------------------- XLSX (oferta / território)

def load_unidades_localizacao(con: duckdb.DuckDBPyConnection, base: Path | None = None) -> str:
    """Unidades_Unificadas_com_Localizacao.xlsx: aba 1 com lat/long, aba 2 com polo."""
    p = (base or data_dir()) / "oferta" / "Unidades_Unificadas_com_Localizacao.xlsx"
    a1 = pd.read_excel(p, sheet_name="Unidades_Unificadas", dtype=str)
    a1.columns = ["designacao", "cre", "microarea", "denominacao", "rua", "bairro", "latitude", "longitude", "tipo"]
    a1["latitude"] = pd.to_numeric(a1["latitude"].str.replace(",", "."), errors="coerce")
    a1["longitude"] = pd.to_numeric(a1["longitude"].str.replace(",", "."), errors="coerce")
    for c in ("designacao", "cre", "microarea", "denominacao", "rua", "bairro", "tipo"):
        a1[c] = a1[c].astype("string").str.strip()
    a2 = pd.read_excel(p, sheet_name="Planilha1", dtype=str)
    a2.columns = ["cre", "designacao", "nome", "endereco", "bairro", "referencia", "microarea", "polo"]
    for c in a2.columns:
        a2[c] = a2[c].astype("string").str.strip()
    con.register("_uloc1", a1)
    con.register("_uloc2", a2)
    con.execute("CREATE OR REPLACE TABLE unidades_loc AS SELECT *, ltrim(designacao, '0') AS codigo_norm FROM _uloc1")
    con.execute("CREATE OR REPLACE TABLE unidades_polo AS SELECT *, ltrim(designacao, '0') AS codigo_norm FROM _uloc2")
    return "unidades_loc"


def _read_total_alunos(p: Path, ano: int) -> pd.DataFrame:
    """Planilhas de ocupação: layout muda por ano (2021 TP/TU; 2022 sem turno; 2023+ Integral/Parcial)."""
    raw = pd.read_excel(p, sheet_name=0, header=None, dtype=object)
    # Localiza a linha em que aparece 'Aluno' (linha de subcabeçalho) e usa as linhas acima para montar nomes
    hdr_row = None
    for i in range(min(6, len(raw))):
        if any(str(v).strip() == "Aluno" for v in raw.iloc[i].tolist()):
            hdr_row = i
            break
    if hdr_row is None:
        raise ValueError(f"{p.name}: linha de subcabeçalho 'Aluno' não encontrada")
    header = raw.iloc[: hdr_row + 1].ffill(axis=1)
    cols = []
    for j in range(raw.shape[1]):
        parts = [str(header.iloc[i, j]).strip() for i in range(hdr_row + 1) if pd.notna(header.iloc[i, j])]
        cols.append(" | ".join(parts))
    df = raw.iloc[hdr_row + 1 :].copy()
    df.columns = cols
    df = df.rename(columns={cols[0]: "cre", cols[1]: "designacao", cols[2]: "denominacao"})
    df = df[df["designacao"].notna()]
    long = []
    for c in cols[3:]:
        parts = [x.strip() for x in c.split(" | ")]
        if not parts or parts[-1] not in ("Aluno", "Turma"):
            continue
        grup = parts[0]
        turno = parts[1] if len(parts) == 3 else None
        for _, r in df.iterrows():
            v = pd.to_numeric(r[c], errors="coerce")
            if pd.isna(v):
                continue
            long.append(
                {
                    "ano": ano,
                    "cre": str(r["cre"]).strip(),
                    "designacao": str(r["designacao"]).strip(),
                    "denominacao": str(r["denominacao"]).strip() if pd.notna(r["denominacao"]) else None,
                    "grupamento_raw": grup,
                    "turno_raw": turno,
                    "medida": parts[-1].lower(),
                    "valor": float(v),
                }
            )
    return pd.DataFrame(long)


def load_total_alunos(con: duckdb.DuckDBPyConnection, base: Path | None = None) -> str:
    base = base or data_dir()
    frames = []
    for ano in range(2021, 2026):
        name = "totaalunoscreche2025.xlsx" if ano == 2025 else f"totalalunoscreche{ano}.xlsx"
        frames.append(_read_total_alunos(base / "oferta" / name, ano))
    df = pd.concat(frames, ignore_index=True)
    con.register("_tot", df)
    con.execute(
        """
        CREATE OR REPLACE TABLE ocupacao AS
        SELECT ano, cre, designacao, ltrim(designacao, '0') AS codigo_norm, denominacao,
               CASE
                 WHEN grupamento_raw ILIKE 'Ber%'        THEN 'Berçário'
                 WHEN grupamento_raw ILIKE 'Maternal I%' AND grupamento_raw NOT ILIKE '%II' THEN 'Maternal I'
                 WHEN grupamento_raw ILIKE 'Maternal II' THEN 'Maternal II'
                 ELSE grupamento_raw
               END AS grupamento,
               CASE
                 WHEN turno_raw IN ('Integral','TU') THEN 'Integral'
                 WHEN turno_raw IN ('Parcial','TP')  THEN 'Parcial'
                 ELSE turno_raw
               END AS horario,
               grupamento_raw, turno_raw, medida, valor
        FROM _tot
        WHERE grupamento_raw NOT ILIKE '%TOTAL%'
        """
    )
    return "ocupacao"


def load_nascidos_vivos(con: duckdb.DuckDBPyConnection, base: Path | None = None) -> str:
    p = (base or data_dir()) / "nascidos_vivos" / "NascidosvivosRJ.xlsx"
    raw = pd.read_excel(p, sheet_name=0, header=None, dtype=object)
    # Acha a linha de cabeçalho: a que contém 'Bairro' na primeira coluna
    hdr = None
    for i in range(min(10, len(raw))):
        v = str(raw.iloc[i, 0]).strip().lower()
        if v.startswith("bairro"):
            hdr = i
            break
    if hdr is None:
        raise ValueError("NascidosvivosRJ.xlsx: cabeçalho 'Bairro' não encontrado")
    df = raw.iloc[hdr + 1 :].copy()
    cols = [str(c).strip() for c in raw.iloc[hdr].tolist()]
    df.columns = cols
    df = df.rename(columns={cols[0]: "bairro"})
    df = df[df["bairro"].notna()]
    long = df.melt(id_vars=["bairro"], var_name="ano", value_name="nascidos")
    long["ano"] = pd.to_numeric(long["ano"], errors="coerce")
    long["nascidos"] = pd.to_numeric(long["nascidos"], errors="coerce")
    long = long[long["ano"].notna()]
    long["ano"] = long["ano"].astype(int)
    long["bairro"] = long["bairro"].astype(str).str.strip()
    # A planilha traz linha de TOTAL; sem este filtro toda soma por ano dobra.
    long = long[~long["bairro"].str.lower().str.startswith("total")]
    con.register("_nv", long)
    con.execute("CREATE OR REPLACE TABLE nascidos_vivos AS SELECT * FROM _nv")
    return "nascidos_vivos"


def load_all(con: duckdb.DuckDBPyConnection, base: Path | None = None) -> None:
    load_query_a(con, base)
    load_query_b(con, base)
    load_query_c(con, base)
    load_query_d(con, base)
    load_unidades_localizacao(con, base)
    load_total_alunos(con, base)
    load_nascidos_vivos(con, base)
