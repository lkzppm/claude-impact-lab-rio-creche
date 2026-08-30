"""Assistente do painel: chat com ferramentas de consulta ao banco para os servidores da CRE/polo e do
Nível Central. "IA na borda, algoritmo determinístico no núcleo" (spec/05): o assistente lê, explica e
aponta o próximo passo; nunca aloca, nunca altera pontuação, nunca escreve no banco.

Módulos:
- escopo.py       — quem pergunta (área, CRE) e a regra "a CRE só vê a própria CRE", aplicada no servidor
- ferramentas.py  — as tools (só leitura), reaproveitando as funções dos routers
- sql.py          — consulta_sql do Nível Central: SELECT-only, transação READ ONLY, timeout, LIMIT
- prompts.py      — prompt de sistema por área
- loop.py         — laço de tool use (independente do SDK: recebe um `chamar(params)`)
- cliente.py      — cliente Anthropic e tradução de erros
- servico.py      — orquestra um turno e grava o log de acesso (consulta_agente)
"""
