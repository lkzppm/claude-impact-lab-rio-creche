# 11 — Baseline técnico (escopo: soluções 1 e 2)

> Contrato entre `backend/`, `frontend/` e `db/`. Escopo desta fase: **(1) motor de classificação por
> criança** (Deferred Acceptance, determinístico, com log de decisão) e **(2) painel de convocação da
> CRE/polo** (log de eventos com carimbo de tempo). Agente de WhatsApp, assistente de escolha, RMI e
> planejamento por coorte ficam para depois ([04](04-analise-tecnica.md), [09 §8](09-achados-dos-dados.md)).

## Stack e por quê

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | **React 18 + Vite + TypeScript**, CSS puro com tokens | Sem framework de UI pesado; design system replicando o `matricula.rio` (ver abaixo) |
| Backend | **FastAPI** (Python 3.12), SQLAlchemy 2, Pydantic 2 | Tipagem, OpenAPI grátis, fácil de auditar |
| Banco de registro | **PostgreSQL 16** | Sistema de registro do processo: inscrições, alocações, **log de eventos append-only**. Transacional, auditável, o que a Prefeitura já opera |
| Banco analítico | **DuckDB** (embarcado, no ETL) | Lê os `.csv.gz` da SME direto, aguenta 4,3 M linhas em segundos, sem servidor. Usado só para auditar e carregar; nunca serve requisição |
| Container | `docker-compose`: `db`, `backend`, `frontend` | Sobe com um comando |

Regra: **o motor de matching é código puro Python, sem I/O**, testado com casos pequenos. O LLM não entra
nesta fase (a explicação do resultado é gerada a partir do log de decisão, em texto templado; o Claude
entra depois, sobre esse mesmo log).

## Design system (espelho do matricula.rio)

Extraído dos CSS públicos de `matricula.rio/App_Themes/v2025/` em 30/08/2026:

| Token | Valor | Uso no site original |
|---|---|---|
| `--mr-blue-900` | `#004A80` | títulos, texto de destaque |
| `--mr-blue-800` | `#00508A` | hover, bordas |
| `--mr-blue-700` | `#005E96` | **barra do menu** (`.whrapper_menu`) |
| `--mr-cyan-600` | `#028FBE` | links, botões secundários |
| `--mr-cyan-400` | `#1BB5D9` | acento, ícones |
| `--mr-ink` | `#181818` | texto |
| `--mr-ink-soft` | `#424242` | texto secundário |
| `--mr-grey-100` | `#F4F4F4` | fundo de seção |
| `--mr-grey-200` | `#ECECEC` | divisores |
| `--mr-white` | `#FFFFFF` | fundo |
| raio | `8px` cards · `15px`/`25px` botões (pílula) | `.btn`, cards |
| fonte | **Gotham** (títulos/menu) e **Cera Pro** (corpo) — proprietárias | substituir por **Montserrat** (Google Fonts), pesos 400/500/600/700; fallback `system-ui` |
| grid | Bootstrap 5.3.3 (container 1140px) | reproduzir `max-width: 1140px` no container |

Estados semânticos (não existem no site; são nossos): `--ok #1E7F4F`, `--warn #B7791F`, `--danger #B8421A`.

## Modelo de dados (PostgreSQL)

Nomes em português, `snake_case`. Chaves da SME preservadas para rastreabilidade.

```
processo      ano PK · prm_id · descricao
pergunta      (ano, ich_perg_id) PK · perg_id · texto · pontuacao · criterio_desempate bool · ordem
unidade       codigo PK (esc_codigo) · nome · tipo · logradouro · numero · bairro · cep · cre · microarea · polo · lat · lon
inscricao     id PK · ano · prm_id · plm_id · ipl_id · UNIQUE(prm_id, plm_id, ipl_id)
              aluno_anon · responsavel_anon · nascimento_anomes · sexo · cep · bairro · data_criacao
              pontuacao (calculada = Σ pontuacao das respostas 'Sim' na régua do ano; nunca editada à mão)
opcao         id PK · inscricao_id FK · ordem (1..5) · unidade_codigo FK · grupamento · horario · situacao_origem
resposta      (inscricao_id, ich_perg_id) PK · resposta bool · confirmado bool
capacidade    (ano, unidade_codigo, grupamento, horario) PK · vagas int · fonte ('estimada_confirmados' | 'informada')
rodada        id PK · ano · tipo ('inicial' | 'rematch') · criada_em · parametros jsonb · hash_entrada · resumo jsonb
alocacao      id PK · rodada_id FK · inscricao_id FK · opcao_id FK nullable · unidade_codigo · grupamento · horario
              status ('alocada' | 'lista_espera' | 'sem_opcao_viavel') · posicao_fila · pontuacao · motivo jsonb
convocacao    id PK · alocacao_id FK · inscricao_id FK · unidade_codigo · grupamento · horario
              status ('selecionada' | 'contato_tentado' | 'contato_confirmado' | 'confirmada' | 'recusada' | 'expirada')
              prazo_fim timestamptz · criada_em · atualizada_em
evento        id PK · ocorrido_em timestamptz · tipo · convocacao_id FK nullable · inscricao_id FK nullable
              unidade_codigo nullable · ator · payload jsonb          -- APPEND-ONLY: sem UPDATE/DELETE
```

- `evento` é o **dado que hoje não existe** (gap nº 1 da SME). Toda transição de `convocacao.status` gera
  um `evento`; o status é derivável do log.
- `capacidade` é **estimada** na carga inicial (nº de `Confirmado` por unidade/grupamento/turno/ano) e
  marcada como tal — a base traz ocupação, não oferta ([09 §7](09-achados-dos-dados.md#7-o-que-os-dados-não-permitem)).
- `situacao_origem` guarda o desfecho real da SME para comparação com o resultado do motor.

## Motor (Deferred Acceptance, lado da criança propondo)

Entrada por `(ano, grupamento, horario)`:
- lista de preferência de cada inscrição = `opcao` ordenada por `ordem`;
- prioridade de cada unidade = `pontuacao` desc → desempate por `pergunta.criterio_desempate` na ordem
  da régua do ano → `data_criacao` asc → `inscricao.id` (ordenação eletrônica);
- capacidade por unidade.

Saída: uma `alocacao` por inscrição, com `motivo`:
```json
{"propostas": [{"unidade": "…", "ordem": 1, "resultado": "rejeitada", "corte": 56, "vagas": 20}, …],
 "final": {"unidade": "…", "ordem": 2, "posicao": 7}}
```
Invariantes testadas: nenhuma inscrição alocada em mais de uma unidade; nenhuma unidade acima da
capacidade; estabilidade (nenhum par inscrição–unidade prefere trocar); determinismo (mesma entrada →
mesmo `hash_entrada` → mesma saída).

## API (prefixo `/api/v1`)

| Método | Rota | Devolve |
|---|---|---|
| GET | `/health` | `{status, db, versao}` |
| GET | `/processos` | anos disponíveis e régua resumida |
| GET | `/processos/{ano}/regua` | perguntas + pontuação do ano |
| GET | `/unidades?cre=&q=&limit=` | lista com lat/lon |
| GET | `/unidades/{codigo}` | ficha + capacidade por grupamento/turno |
| GET | `/inscricoes?ano=&unidade=&situacao=&page=` | paginado |
| GET | `/inscricoes/{id}` | inscrição + opções + respostas + pontuação |
| POST | `/classificacao/rodadas` `{ano, grupamento?, horario?, tipo}` | executa o motor, grava `rodada` + `alocacao`, devolve resumo |
| GET | `/classificacao/rodadas` · `/classificacao/rodadas/{id}` | lista / detalhe com resumo |
| GET | `/classificacao/rodadas/{id}/alocacoes?unidade=&status=` | alocações |
| GET | `/classificacao/rodadas/{id}/explicacao/{inscricao_id}` | texto + `motivo` estruturado |
| POST | `/convocacoes/gerar` `{rodada_id}` | cria uma `convocacao` (status `selecionada`) por alocação + evento |
| GET | `/convocacoes?cre=&unidade=&status=&atrasadas=` | lista com `horas_no_status` |
| GET | `/convocacoes/{id}` | detalhe + eventos |
| POST | `/convocacoes/{id}/eventos` `{tipo, payload}` | registra transição; devolve novo status |
| GET | `/painel/resumo?cre=&unidade=` | KPIs: selecionadas aguardando (por faixa 0–24h, 24–48h, 48–72h, >72h), vagas em risco, sem contato, inconsistências |
| GET | `/painel/unidades?cre=` | uma linha por unidade: vagas, alocadas, convocadas, confirmadas, em atraso |

Erros em JSON `{detail}`; paginação `{items, total, page, size}`.

## ETL e auditoria (`backend/app/etl/`)

- `audit.py` — lê `data/` com DuckDB e escreve `out/auditoria-dados.md` + `.json`. Verifica as armadilhas
  de [03](03-dados-disponiveis.md) (BOM, CRLF, QueryD sem cabeçalho, `grupamento` com espaço, `situacao`
  sem acento), integridade das junções, domínios, duplicatas, faixas de lat/lon, régua por ano.
- `load.py` — carrega Postgres a partir do DuckDB já saneado. Idempotente (`TRUNCATE` + `COPY`).
- Nunca escreve em `data/`.

## Estrutura

```
backend/   app/{main,config,db,models,schemas}.py · app/routers/ · app/engine/ · app/etl/ · tests/ · Dockerfile
frontend/  src/{design-system,api,pages,components}/ · Dockerfile (nginx)
db/        init/*.sql (schema versionado, aplicado pelo Postgres na subida)
out/       relatórios de auditoria (commitados; não vão para data/)
docker-compose.yml · .env.example · Makefile
```
