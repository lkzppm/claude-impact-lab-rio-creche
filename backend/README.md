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
make seed        # dados de demonstração: classifica, convoca e simula 5 dias de convocação (SEED_ARGS="--limpar --todos")
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
| `app/routers/painel.py` | KPIs da CRE/polo em SQL: faixas de tempo, vencidas, vencem em 24 h, sem aviso, crianças com várias reservas, tempo até o desfecho |
| `app/routers/unidades.py` | Ficha, **fila de espera da unidade** (ordem do motor) e **capacidade informada** pela unidade (`fonte = informada`, com evento) |
| `app/etl/` | Auditoria, carga das bases da SME (DuckDB → Postgres) e `seed_demo.py` (eventos simulados com carimbo de tempo, pelas mesmas funções da API) |
| `tests/` | Invariantes do motor |

## Rotas (`/api/v1`)

`GET /health` · `GET /processos` · `GET /processos/{ano}/regua` · `GET /unidades` · `GET /unidades/{codigo}` ·
`GET /inscricoes` · `GET /inscricoes/{id}` · `POST /classificacao/rodadas` · `GET /classificacao/rodadas[/{id}]` ·
`GET /classificacao/rodadas/{id}/alocacoes` · `GET /classificacao/rodadas/{id}/explicacao/{inscricao_id}` ·
`POST /inscricoes/{id}/comprovar` · `GET /inscricoes/{id}/comprovacoes` ·
`POST /convocacoes/gerar` · `GET /convocacoes?fila=` · `GET /convocacoes/{id}` · `POST /convocacoes/{id}/eventos` ·
`POST /convocacoes/{id}/convocar-proximo` · `POST /convocacoes/expirar-vencidas` ·
`GET /unidades/{codigo}/fila` · `PUT /unidades/{codigo}/capacidade` ·
`GET /painel/resumo` · `GET /painel/unidades` · `GET /painel/multireserva` · `GET /painel/cres` ·
`GET /familia/inscricao` · `POST /familia/convocacoes/{id}/responder`

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

### Ferramentas do polo (CRE)

- **Filas de trabalho** — `GET /convocacoes?fila=vencidas|vencem_24h|sem_aviso|aguardando|abertas|trabalho|encerradas`,
  ordenadas por urgência (prazo mais próximo primeiro). Cada convocação aberta traz `proxima_acao`, uma frase
  derivada de status + prazo ("Avisar a família", "Tentar contato de novo", "Prazo venceu: registrar desfecho…").
- **Convocar o próximo da fila** — `POST /convocacoes/{id}/convocar-proximo` só quando a vaga daquela convocação
  foi liberada (`recusada`, `expirada` ou `liberada`). Pega a 1ª alocação `lista_espera` da mesma rodada/unidade/
  grupamento/turno, na `posicao_fila` do motor, pulando quem já confirmou matrícula, quem já teve convocação
  naquela unidade e quem já segura `vagas_presas` reservas. Evento `selecionada_da_lista` (o nome que a SME
  já usa: "Selecionado da lista"). Uma vaga liberada só é repassada uma vez (`repassada_para` no detalhe).
- **Expirar em lote** — `POST /convocacoes/expirar-vencidas {cre?, unidade?, ator?}` registra `expirada` em
  todas as abertas com `prazo_fim` passado. A mesma função roda como rotina se `EXPIRACAO_AUTOMATICA_MINUTOS > 0`
  (ator `sistema`); por padrão fica desligada para a demonstração mostrar as vencidas no painel.
- **Fila de espera da unidade** — `GET /unidades/{codigo}/fila?grupamento=&horario=`: quem é o próximo, com a
  situação de cada criança (`aguardando`, `convocada_aqui`, `confirmada_em_outra`, `reservas_cheias`).
- **Capacidade informada** — `PUT /unidades/{codigo}/capacidade {ano, grupamento, horario, vagas, ator?}` grava
  `fonte = informada` e um evento `capacidade_informada` com o valor anterior.
- **Quem registra** — todo corpo de ação aceita `ator` (nome/matrícula do servidor); o frontend guarda no
  navegador e envia sempre. Sem login nesta fase; o log de eventos já fica nominal.
- **`payload.canal`** nas tentativas/avisos/recusas: `whatsapp | ligacao | sms | email | visita` (a família grava
  `painel_familia`). É a escalada multicanal rastreada da spec/04.

### Dados de demonstração

`make seed` (`app/etl/seed_demo.py`) roda a classificação de 1 vaga e a de 3 reservas para Berçário · Integral
do último ano carregado, cria as convocações espalhadas pelos últimos 5 dias e sorteia, por criança, o que
aconteceu (nada · tentativas · avisada e depois confirmou/recusou/aguarda · recusa direta · parte das vencidas
já expirada). Tudo passa por `_criar_convocacao`/`_aplicar_transicao` — as mesmas funções da API — com
`ocorrido_em` no passado (`evento` é append-only, mas aceita a data no INSERT). `--todos` cobre todos os
grupamentos/turnos; `--limpar` zera as tabelas de operação antes. O PRD §9 registra que a banca vê dados simulados.

### Decisões

- `capacidade.fonte = 'estimada_confirmados'` na carga inicial: a base traz ocupação, não oferta.
- A régua é lida de `pergunta` por ano; nada de pontuação hard-coded.
- `evento` tem trigger que rejeita `UPDATE`/`DELETE`.
- `comprovacao` só **armazena** o resultado das consultas (mock por padrão); a pontuação segue = declarado × régua.
- `pontuacao` de `GET /inscricoes/{id}` é sempre recalculada das respostas × régua (a coluna é cache da carga).
