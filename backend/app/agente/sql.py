"""`consulta_sql`: consulta livre do Nível Central, com quatro travas independentes.

1. Validação léxica: só SELECT/WITH, sem `;`, sem comentários, sem DDL/DML, sem `pg_*`/catálogo.
2. A consulta vira subconsulta: `SELECT * FROM (<sql>) consulta LIMIT n` — o LIMIT é nosso, não do modelo.
3. Transação `READ ONLY` numa conexão própria — o Postgres rejeita escrita mesmo que a validação falhe.
4. `statement_timeout` local — uma consulta pesada não segura a API.

A área CRE não tem esta ferramenta: não dá para garantir o filtro de território em SQL arbitrário.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

LIMITE_PADRAO = 200
TAMANHO_MAX = 4000

_PROIBIDAS = re.compile(
    r"\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|analyse|"
    r"cluster|reindex|refresh|lock|call|do|execute|prepare|deallocate|listen|notify|set|reset|show|begin|"
    r"commit|rollback|savepoint|release|into|returning|comment|security|role|user|database|schema|extension|"
    r"function|procedure|trigger|policy|dblink|information_schema|current_setting|set_config|lo_import|"
    r"lo_export|pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|current_user|session_user)\b",
    re.IGNORECASE,
)
_LITERAL = re.compile(r"'(?:[^']|'')*'")
_CATALOGO = re.compile(r"\bpg_\w*", re.IGNORECASE)
_INICIO = re.compile(r"^\s*(select|with)\b", re.IGNORECASE)


class SqlRejeitado(ValueError):
    pass


def validar(sql: str) -> str:
    """Devolve a consulta limpa ou levanta SqlRejeitado com o motivo (em português, para o modelo repassar)."""
    if not isinstance(sql, str) or not sql.strip():
        raise SqlRejeitado("consulta vazia")
    s = sql.strip()
    if len(s) > TAMANHO_MAX:
        raise SqlRejeitado(f"consulta maior que {TAMANHO_MAX} caracteres")
    if ";" in s:
        raise SqlRejeitado("ponto e vírgula não é permitido: uma única consulta por vez")
    if "--" in s or "/*" in s or "*/" in s:
        raise SqlRejeitado("comentários não são permitidos")
    if "$$" in s or "\\" in s:
        raise SqlRejeitado("caracteres não permitidos ($$ ou barra invertida)")
    if not _INICIO.match(s):
        raise SqlRejeitado("a consulta precisa começar com SELECT ou WITH")
    # palavras-chave são procuradas fora dos literais ('EDI DO POVO' não pode derrubar a consulta por causa do DO)
    sem_literais = _LITERAL.sub("''", s)
    m = _PROIBIDAS.search(sem_literais)
    if m:
        raise SqlRejeitado(f"palavra não permitida: {m.group(0).upper()} (só leitura)")
    m = _CATALOGO.search(sem_literais)
    if m:
        raise SqlRejeitado(f"acesso ao catálogo não permitido: {m.group(0)}")
    return s


def embrulhar(sql: str, limite: int) -> str:
    return f"SELECT * FROM (\n{sql}\n) AS consulta LIMIT {int(limite)}"


def executar(engine: Engine, sql: str, *, limite: int = LIMITE_PADRAO, timeout_ms: int = 5000) -> dict[str, Any]:
    """Valida, embrulha e executa em transação READ ONLY com timeout. Devolve colunas + linhas (listas)."""
    limpo = validar(sql)
    limite = max(1, min(int(limite or LIMITE_PADRAO), LIMITE_PADRAO))
    final = embrulhar(limpo, limite)
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            if conn.dialect.name == "postgresql":
                conn.execute(text("SET TRANSACTION READ ONLY"))
                conn.execute(text(f"SET LOCAL statement_timeout = {int(timeout_ms)}"))
            res = conn.execute(text(final))
            colunas = list(res.keys())
            linhas = [list(r) for r in res.fetchall()]
        finally:
            trans.rollback()   # nunca há o que confirmar
    return {"colunas": colunas, "linhas": linhas, "n": len(linhas), "cortado_em": limite if len(linhas) >= limite else None}
