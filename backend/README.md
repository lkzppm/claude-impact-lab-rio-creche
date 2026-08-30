# backend/ — API do baseline

FastAPI + SQLAlchemy 2 sobre PostgreSQL 16. Contrato em [`spec/11-baseline-tecnico.md`](../spec/11-baseline-tecnico.md).

## Rodar

```bash
# local (na raiz do repo)
cp .env.example .env
make venv        # cria .venv e instala backend[dev]
make db          # sobe só o Postgres (aplica db/init/001_schema.sql)
make audit       # relatório das bases em out/
make load        # carrega data/ no Postgres
make api         # http://localhost:8000/docs
make test

# tudo em containers
make up          # db + backend (:8000) + frontend (:5173)
```

## Onde está o quê

| Caminho | O que é |
|---|---|
| `app/engine/matching.py` | **Motor de classificação por criança** (Deferred Acceptance com cota `vagas_presas`, padrão 3 + `alternativas` 2; com `vagas_presas=1` é o DA clássico, estável). Código puro, sem I/O, sem LLM. `verificar_invariantes()` checa cota por criança, capacidade e (q=1) estabilidade |
| `app/integracoes/` | Provedores de **comprovação** de critérios (`base.py` = interface; `mock.py` = Conecta CadÚnico / Bolsa Família / Receita CPF / RMI simulados; `registry.py` escolhe por `COMPROVACAO_PROVIDER`) |
| `app/engine/scoring.py` | Pontuação a partir das respostas × régua do ano (só `Sim` pontua; desempates viram flags) |
| `app/routers/classificacao.py` | Executa rodadas (`inicial` / `rematch`), persiste `rodada` + `alocacao`, explica o resultado a partir do log de decisão |
| `app/routers/convocacoes.py` | Máquina de estados da convocação; cada transição gera um `evento` (append-only) |
| `app/routers/painel.py` | KPIs da CRE/polo em SQL |
| `app/etl/` | Auditoria e carga das bases da SME (DuckDB → Postgres) |
| `tests/` | Invariantes do motor |

## Rotas (`/api/v1`)

`GET /health` · `GET /processos` · `GET /processos/{ano}/regua` · `GET /unidades` · `GET /unidades/{codigo}` ·
`GET /inscricoes` · `GET /inscricoes/{id}` · `POST /classificacao/rodadas` · `GET /classificacao/rodadas[/{id}]` ·
`GET /classificacao/rodadas/{id}/alocacoes` · `GET /classificacao/rodadas/{id}/explicacao/{inscricao_id}` ·
`POST /inscricoes/{id}/comprovar` · `GET /inscricoes/{id}/comprovacoes` ·
`POST /convocacoes/gerar` · `GET /convocacoes[/{id}]` · `POST /convocacoes/{id}/eventos` ·
`GET /painel/resumo` · `GET /painel/unidades`

### Rodada: "3 vagas presas + 2 alternativas"

`POST /classificacao/rodadas {ano, tipo, vagas_presas=3, alternativas=2, grupamento?, horario?}`. Cada criança
segura até `vagas_presas` vagas (linhas `alocacao` com `tipo='presa'`, `status='alocada'`) e fica com até
`alternativas` opções em espera (`tipo='selecionavel'`, `status='lista_espera'`, `posicao_fila` na fila da unidade).
Para comparar com o DA clássico, rode com `vagas_presas=1`. `resumo` traz `media_presas_por_crianca`,
`n_criancas_com_alguma_presa` e `por_ordem_da_opcao`.

### Transições da convocação

Uma convocação por vaga **presa** (até 3 por criança). Corpo de `POST /convocacoes/{id}/eventos`:
`{tipo, payload: {observacao?}}` com `tipo ∈ tentativa_contato | contato_confirmado | matricula_confirmada | recusa | expiracao`
(os nomes de status `contato_tentado | confirmada | recusada | expirada` também são aceitos). Resposta `{status, evento, convocacao}`.

`selecionada → contato_tentado (repete) → contato_confirmado → confirmada | recusada | expirada`; qualquer estado
aberto pode ir a `expirada`. Ao **confirmar** uma vaga, as outras convocações abertas da mesma criança passam
automaticamente a `liberada` (evento `liberada_por_confirmacao`) — a vaga volta ao pool na hora, não em 3 dias.
`recusada`/`expirada` liberam só aquela vaga. Toda liberação marca `alocacao.vaga_liberada = true`; a próxima rodada
`rematch` exclui quem já confirmou, desconta as confirmadas da capacidade e redistribui.
Ao registrar `contato_confirmado`, `prazo_fim` é recalculado: o relógio conta do contato, não do envio.

### Decisões

- `capacidade.fonte = 'estimada_confirmados'` na carga inicial: a base traz ocupação, não oferta.
- A régua é lida de `pergunta` por ano; nada de pontuação hard-coded.
- `evento` tem trigger que rejeita `UPDATE`/`DELETE`.
- `comprovacao` só **armazena** o resultado das consultas (mock por padrão); a pontuação segue = declarado × régua.
- `pontuacao` de `GET /inscricoes/{id}` é sempre recalculada das respostas × régua (a coluna é cache da carga).
