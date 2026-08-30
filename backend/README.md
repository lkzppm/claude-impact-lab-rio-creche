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
| `app/agente/` | **Assistente do painel** (chat com ferramentas de consulta, só leitura) — ver seção abaixo |
| `app/routers/chat.py` | `POST /chat`: um turno do assistente; 503 sem `ANTHROPIC_API_KEY` |
| `tests/` | Invariantes do motor (`test_matching.py`), assistente sem rede (`test_agente.py`), integração com Postgres (`test_api_integracao.py`, só com `TEST_DATABASE_URL`) |

## Rotas (`/api/v1`)

`GET /health` · `GET /processos` · `GET /processos/{ano}/regua` · `GET /unidades` · `GET /unidades/{codigo}` ·
`GET /inscricoes` · `GET /inscricoes/{id}` · `POST /classificacao/rodadas` · `GET /classificacao/rodadas[/{id}]` ·
`GET /classificacao/rodadas/{id}/alocacoes` · `GET /classificacao/rodadas/{id}/explicacao/{inscricao_id}` ·
`POST /inscricoes/{id}/comprovar` · `GET /inscricoes/{id}/comprovacoes` ·
`POST /convocacoes/gerar` · `GET /convocacoes[/{id}]` · `POST /convocacoes/{id}/eventos` ·
`GET /painel/resumo` · `GET /painel/unidades` · `GET /painel/cres` · `GET /familia/inscricao` ·
`POST /familia/convocacoes/{id}/responder` · `POST /chat`

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

### Assistente (chat com tools) — `app/agente/`

Botão **"Perguntar ao painel"** nas áreas CRE/polo e Nível Central. O servidor pergunta em português ("quais
convocações vencem hoje?", "qual unidade tem mais vagas em risco?") e o assistente responde consultando o banco
por ferramentas — e mostra, em uma linha por consulta, o que leu ("consultou: resumo do painel · 4ª CRE").

**Rota.** `POST /chat` com `{area: "cre"|"sme", cre?, ator?, mensagens: [{role, content}]}` →
`{resposta, ferramentas: [{nome, argumentos, resumo, erro?}], modelo, tokens_entrada, tokens_saida, log_id}`.
Sem streaming. O estado da conversa fica no cliente (o histórico inteiro vai a cada turno; o servidor guarda
só as últimas `CHAT_MAX_HISTORICO` mensagens). Na área `cre`, `cre` é obrigatória (422 sem ela).
Erros: 503 sem chave, 429 limite do serviço, 504 timeout, 502 falha do serviço — sempre com `detail` em português.

**Ferramentas (todas só leitura, reaproveitando as funções dos routers — o número que o assistente diz é o mesmo
que a tela mostra).**

| Ferramenta | O que lê | Área |
|---|---|---|
| `resumo_painel(cre?, unidade?)` | KPIs de `GET /painel/resumo` | cre, sme |
| `painel_unidades(cre?, ordenar_por?, limit)` | uma linha por unidade (`GET /painel/unidades`), ordenada | cre, sme |
| `listar_convocacoes(cre?, unidade?, status?, prazo?, incluir_codigos?, limit)` | total, contagem por status e amostra; `prazo` = vencido · hoje · ate_24h · ate_48h · ate_72h | cre, sme |
| `detalhe_convocacao(id)` | convocação + linha do tempo + irmãs (`GET /convocacoes/{id}`) | cre, sme |
| `ficha_inscricao(codigo, ano?)` | visão consolidada da inscrição (`GET /familia/inscricao`) — dado sensível | cre, sme |
| `explicacao_resultado(rodada_id, inscricao_id)` | texto do log de decisão (`GET /classificacao/rodadas/{id}/explicacao/{insc}`) | cre, sme |
| `buscar_unidades(cre?, q?, limit)` · `capacidade_unidade(codigo)` | `GET /unidades`, `GET /unidades/{codigo}` + linha do painel | cre, sme |
| `resumo_cres(ano?)` · `rodadas(limit)` · `regua(ano?)` | `GET /painel/cres`, `GET /classificacao/rodadas`, `GET /processos/{ano}/regua` | cre (só a própria CRE em `resumo_cres`), sme |
| `consulta_sql(sql, motivo?)` | SELECT livre: validação léxica (só SELECT/WITH, sem `;`, DDL/DML, `pg_*`), `SELECT * FROM (…) LIMIT 200`, transação `READ ONLY`, `statement_timeout` | **só sme** |

**Escopo por área — aplicado no servidor, não no prompt.** Na área `cre`, `Escopo.cre_efetiva()` força a CRE do
usuário em toda ferramenta; pedir outra CRE devolve `{"erro": …}` ao modelo; convocação, unidade e inscrição de
outra CRE são recusadas (`exigir_cre` / `exigir_alguma_cre` — uma inscrição pertence à CRE se tem ao menos uma
opção ou convocação nela). `consulta_sql` não existe nessa área. Na área `sme`, rede inteira.

**Regras inegociáveis (no prompt de sistema e no código).** O assistente só lê: não registra contato, não
confirma matrícula, não muda status, não altera pontuação. Não decide alocação: a pontuação é norma
(Res. SME 542/2025) e a distribuição é do motor determinístico. Não inventa número: tudo vem de ferramenta, e a
resposta diz de onde veio. Dado de criança: base anonimizada (`aluno_anon`), agregados por padrão, códigos só
quando pedido (`incluir_codigos`), critérios sensíveis só em pergunta sobre uma inscrição específica.

**Log de acesso (LGPD).** Cada turno grava uma linha em `consulta_agente` (`db/init/002_agente.sql`,
append-only por trigger): quando, área, CRE, ator, modelo, **hash** da pergunta (não o texto), ferramentas com
argumentos (= quais dados foram lidos), tokens, duração, resultado (`ok | erro | recusa`). Não guarda pergunta,
resposta nem o conteúdo devolvido pelas ferramentas.

**Falhas.** Ferramenta que levanta exceção devolve `{"erro": …}` ao modelo (a sessão é revertida e segue
usável); o modelo explica ao servidor e responde com o que tem. Depois de `CHAT_MAX_TOOLS` chamadas a
requisição seguinte vai com `tool_choice = none` para fechar a resposta. Recusa do modelo vira resposta
educada; `fallbacks="default"` (beta) repete a chamada em outro modelo quando um classificador recusa.

**Configurar.** No `.env` da raiz (o `docker-compose` passa para o backend):

```
ANTHROPIC_API_KEY=sk-ant-...     # obrigatório para o assistente; sem ela, 503 e o painel segue normal
CHAT_MODEL=claude-opus-5         # padrão
CHAT_MAX_TOOLS=8                 # chamadas de ferramenta por turno
CHAT_EFFORT=medium               # low | medium | high | xhigh | max
CHAT_TIMEOUT_S=90
CHAT_FALLBACKS=true
CHAT_SQL_TIMEOUT_MS=5000
CHAT_SQL_MAX_LINHAS=200
```

Banco novo: `db/init/002_agente.sql` é aplicado na primeira subida do Postgres. Banco já existente:
`psql -f db/init/002_agente.sql`. Testes sem rede: `make test` (`tests/test_agente.py` usa um cliente falso e
SQLite em memória).

### Decisões

- `capacidade.fonte = 'estimada_confirmados'` na carga inicial: a base traz ocupação, não oferta.
- A régua é lida de `pergunta` por ano; nada de pontuação hard-coded.
- `evento` tem trigger que rejeita `UPDATE`/`DELETE`.
- `comprovacao` só **armazena** o resultado das consultas (mock por padrão); a pontuação segue = declarado × régua.
- `pontuacao` de `GET /inscricoes/{id}` é sempre recalculada das respostas × régua (a coluna é cache da carga).
