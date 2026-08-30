## O que muda

<!-- subsistema por subsistema: backend, mensageria, frontend, db, spec -->

## Regras do projeto (marque o que se aplica)

- [ ] Não altera quem tem prioridade: a tabela de pontuação (Res. SME 542/2025) continua sendo norma, não parâmetro
- [ ] Nenhum número sobre a fila/rede foi inventado — todo dado vem de `spec/` ou de `out/auditoria-dados.md`
- [ ] `data/` continua intocado (o CI bloqueia mudanças lá)
- [ ] Sem dado real de criança em código, teste, prompt ou fixture
- [ ] Se mudou o schema: novo arquivo em `db/init/` e `make migrate` documentado
- [ ] Se mudou a spec: `spec/README.md` e a tabela de rota do `CLAUDE.md` atualizados

## Como testar

<!-- comando(s) e o que esperar; `make ci` roda o mesmo que o GitHub Actions -->
