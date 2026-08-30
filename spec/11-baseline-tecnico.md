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
no núcleo: a explicação do resultado é gerada a partir do log de decisão, em texto templado. O Claude entra
**na borda**, como assistente de consulta dos painéis da CRE e do Nível Central (`POST /chat`, seção abaixo):
só lê o banco por ferramentas, não decide alocação e não altera nada.

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
pre_cadastro  id PK · protocolo UNIQUE · cpf_hash · nome_responsavel · nome_crianca · nascimento_anomes · grupamento · horario
              cep · cep_alternativo · bairro · lat · lon · regua_ano · respostas jsonb · pontuacao · escolhas jsonb (≤5) · consentimento_em
contato       id PK · pre_cadastro_id FK · nome · parentesco · canal ('celular'|'whatsapp'|'email') · valor · principal · verificado_em
evento        id PK · ocorrido_em timestamptz · tipo · convocacao_id FK nullable · inscricao_id FK nullable
              unidade_codigo nullable · ator · payload jsonb          -- APPEND-ONLY: sem UPDATE/DELETE
consulta_agente  id PK · ocorrido_em · area ('cre'|'sme') · cre · ator · modelo · pergunta_hash (sha256, não o texto)
              pergunta_chars · ferramentas jsonb [{nome, argumentos, erro?}] · tokens_entrada · tokens_saida
              duracao_ms · resultado ('ok'|'erro'|'recusa')          -- APPEND-ONLY: log de acesso do assistente (LGPD)
```

- `evento` é o **dado que hoje não existe** (gap nº 1 da SME). Toda transição de `convocacao.status` gera
  um `evento`; o status é derivável do log. Tipos gravados: `selecionada`, `selecionada_da_lista`,
  `contato_tentado`, `contato_confirmado`, `confirmada`, `recusada`, `expirada`, `liberada_por_confirmacao`,
  `capacidade_informada`. `ator` é quem registrou (`sistema`, `familia` ou o nome informado pelo servidor);
  `payload.canal` guarda o canal do contato.
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

### Motor contínuo (`backend/app/motor.py`) — roda 24/7, sem botão

A classificação não é um evento de calendário: sobe com a API (`lifespan`) e executa um ciclo a cada
`MOTOR_INTERVALO_SEGUNDOS` (padrão 60; `0` desliga a rotina e deixa só `POST /motor/ciclo`). Cada ciclo:

1. **classifica** se ainda não há rodada do processo vigente (bootstrap) ou se a entrada mudou — a
   assinatura `(nº de inscrições, nº de opções, soma das vagas)` do ano; a rodada nova repete o recorte e
   os parâmetros da anterior;
2. **convoca** as vagas presas da rodada nova (`convocacoes.gerar_convocacoes`), sem duplicar o que já
   está na rua: pula quem confirmou matrícula, quem já foi convocado para aquela unidade e o que passaria
   da cota de reservas abertas;
3. **expira** as convocações vencidas, se `MOTOR_EXPIRAR_VENCIDAS=1` (desligado na demonstração — o polo
   registra em lote e as vencidas ficam visíveis no painel);
4. **cascateia**: cada vaga liberada (recusa, prazo vencido, confirmação em outra unidade) ainda sem
   repasse vai para o próximo da lista de espera daquela unidade, por `proximo_da_fila` — a mesma ordem
   que o polo vê na tela —, com evento `selecionada_da_lista` e ator `motor`. Teto de
   `MOTOR_MAX_REPASSES_POR_CICLO` (padrão 200) por ciclo.

Sem LLM em nenhum passo. Erro em um ciclo não derruba a API: fica em `ultimo_erro` e o próximo ciclo tenta
de novo. Ciclos que mudam alguma coisa viram `evento` (`tipo = motor_ciclo`) no log append-only.

## API (prefixo `/api/v1`)

| Método | Rota | Devolve |
|---|---|---|
| GET | `/health` | `{status, db, versao}` |
| GET | `/processos` | anos disponíveis e régua resumida |
| GET | `/processos/{ano}/regua` | perguntas + pontuação do ano |
| GET | `/unidades?cre=&q=&limit=` | lista com lat/lon |
| GET | `/unidades/{codigo}` | ficha + capacidade por grupamento/turno |
| GET | `/unidades/{codigo}/fila?grupamento=&horario=` | **CRE**: lista de espera da unidade na última rodada, na ordem do motor, com a situação de cada criança (`aguardando` · `convocada_aqui` · `confirmada_em_outra` · `reservas_cheias`) |
| PUT | `/unidades/{codigo}/capacidade` `{ano, grupamento, horario, vagas, ator?}` | capacidade informada pela unidade (`fonte = informada`) + evento `capacidade_informada` |
| GET | `/inscricoes?ano=&unidade=&situacao=&page=` | paginado |
| GET | `/inscricoes/{id}` | inscrição + opções + respostas + pontuação |
| GET | `/motor` | **estado do motor contínuo**: ligado, intervalo, última/próxima passada, totais (rodadas, convocações, expiradas, vagas repassadas), `ultimo_ciclo`, rodada vigente e vagas liberadas ainda sem repasse |
| POST | `/motor/ciclo` | força um ciclo agora (mesma função da rotina de fundo); devolve o estado |
| GET | `/motor/eventos?limit=` | últimos ciclos que mudaram alguma coisa, do log append-only (`evento.tipo = motor_ciclo`) |
| POST | `/classificacao/rodadas` `{ano, grupamento?, horario?, tipo}` | executa o motor, grava `rodada` + `alocacao`, devolve resumo (o motor contínuo chama a mesma função) |
| GET | `/classificacao/rodadas` · `/classificacao/rodadas/{id}` | lista / detalhe com resumo |
| GET | `/classificacao/rodadas/{id}/alocacoes?unidade=&status=` | alocações |
| GET | `/classificacao/rodadas/{id}/explicacao/{inscricao_id}` | texto + `motivo` estruturado |
| POST | `/convocacoes/gerar` `{rodada_id}` | cria uma `convocacao` (status `selecionada`) por vaga presa + evento; pula quem já confirmou matrícula, quem já foi convocado para aquela unidade e o que passaria da cota de reservas abertas (idempotente entre rodadas) |
| GET | `/convocacoes?cre=&unidade=&status=&fila=` | lista com `horas_no_status`, `atrasada` e `proxima_acao`; `fila` = `vencidas` · `vencem_24h` · `sem_aviso` · `aguardando` · `abertas` · `trabalho` · `encerradas`, ordenada por urgência |
| GET | `/convocacoes/{id}` | detalhe + eventos + irmãs; se a vaga foi liberada, `proximo_da_fila` ou `repassada_para` |
| POST | `/convocacoes/{id}/eventos` `{tipo, payload{observacao?, canal?}, ator?}` | registra transição; devolve novo status |
| POST | `/convocacoes/{id}/convocar-proximo` `{ator?}` | vaga liberada → convoca o próximo da lista de espera da unidade (evento `selecionada_da_lista`); 409 se ainda aberta ou já repassada |
| POST | `/convocacoes/expirar-vencidas` `{cre?, unidade?, ator?}` | registra `expirada` em lote nas abertas com prazo vencido; a mesma função roda dentro do motor se `MOTOR_EXPIRAR_VENCIDAS=1` |
| GET | `/painel/resumo?cre=&unidade=` | KPIs: selecionadas aguardando (por faixa 0–24h, 24–48h, 48–72h, >72h), vagas em risco, sem aviso, aguardando a família, vencidas, vencem em 24 h, crianças com várias reservas, inconsistências, tempo médio até o desfecho |
| GET | `/painel/multireserva?cre=&unidade=` | crianças com mais de uma reserva aberta: nº de reservas, unidades, há quanto tempo |
| GET | `/painel/unidades?cre=` | uma linha por unidade: vagas, alocadas, convocadas, confirmadas, em atraso |
| GET | `/painel/cres?ano=` | **Nível Central**: uma linha por CRE — unidades, vagas, inscrições, alocadas, convocadas, abertas, confirmadas, em atraso, lista de espera |
| GET | `/painel/mapa?cre=&ano=` | **mapa com drill-down**: sem `cre`, uma linha por CRE com centroide (lat/lon médios das unidades); com `cre`, **todas** as unidades daquela CRE que participam do processo de creche (têm vaga, inscrição ou convocação), com lat/lon, vagas, inscrições de 1ª opção, reservadas, lista de espera, convocadas, abertas, confirmadas e vencidas |
| GET | `/familia/inscricao?codigo=&ano=` | **Família**: situação em linguagem de responsável — `situacao_resumo`, opções com `resultado` (reservada/fila/sem_vaga) e posição, reservas abertas com prazo, pontuação por critério com comprovação, explicação |
| POST | `/familia/convocacoes/{id}/responder` `{resposta: confirmar\|recusar}` | a família responde na hora; confirmar libera as outras reservas (`ator = familia` no log) |
| POST | `/chat` `{area: cre\|sme, cre?, ator?, mensagens: [{role, content}]}` | **Assistente** (áreas CRE e Nível Central): `{resposta, ferramentas: [{nome, argumentos, resumo, erro?}], modelo, tokens_entrada, tokens_saida, log_id}`. Só leitura; na área `cre` toda ferramenta é restrita à CRE informada (no servidor); 503 sem `ANTHROPIC_API_KEY` |
| GET | `/familia/regua?ano=` | critérios do questionário com pontos (norma, só leitura) para o pré-cadastro |
| GET | `/geo/cep/{cep}` | endereço (BrasilAPI) + coordenada (Nominatim → centroide do bairro na base); `fonte` declara a precisão |
| POST | `/familia/sugestoes` `{cep\|lat,lon, grupamento, horario, respostas}` | **tempo real**: pontuação pelo motor + até 15 unidades com distância, vagas e `chance` (= % das crianças com até a sua pontuação que escolheram a unidade e conseguiram vaga no ano da régua); as 5 primeiras são o top 5 |
| POST | `/familia/pre-cadastro` | grava pré-cadastro (jul–ago): criança, CEP(s), respostas, **≥3 contatos (pessoas/canais distintos) com parentesco e canal**, até 5 escolhas em ordem, consentimento; CPF só como hash; devolve `protocolo` |
| GET | `/familia/pre-cadastro/{protocolo}` | consulta do pré-cadastro |
| GET | `/mensagens/saude` · `/mensagens/templates` | provedor ativo por canal (sem expor credencial) e catálogo de mensagens com os dados obrigatórios de cada uma |
| POST | `/mensagens/enviar` `{canal, destino, template, dados, referencia?, chave_idem?, ator?}` | pede um envio ao serviço de mensageria; **sempre 200** — o desfecho vem em `resultado` (`enviado` · `simulado` · `pendente` · `falha`) |

Erros em JSON `{detail}`; paginação `{items, total, page, size}`.

## Assistente (`backend/app/agente/`)

Chat com ferramentas sobre o mesmo banco, para o servidor perguntar em português o que o painel mostra.
**IA na borda, algoritmo determinístico no núcleo** ([05](05-arquitetura-e-riscos.md)):

- Ferramentas só leitura (`resumo_painel`, `painel_unidades`, `listar_convocacoes`, `detalhe_convocacao`,
  `ficha_inscricao`, `explicacao_resultado`, `buscar_unidades`, `capacidade_unidade`, `resumo_cres`, `rodadas`,
  `regua` e, só no Nível Central, `consulta_sql` SELECT-only em transação `READ ONLY`), reaproveitando as
  funções dos routers — uma só implementação das regras.
- Escopo por área aplicado no servidor: na área `cre`, a CRE do usuário é forçada em toda consulta e dados de
  outra CRE são recusados; na `sme`, rede inteira.
- O prompt de sistema diz que a pontuação é norma (Res. SME 542/2025), que a alocação é do motor e que o
  assistente não altera nada; dados de criança são anonimizados e devolvidos agregados por padrão.
- Log de acesso `consulta_agente` (append-only): hash da pergunta, ferramentas com argumentos, tokens — não
  guarda o texto da pergunta nem da resposta.
- **"Isso já está no painel"** (`app/agente/secoes.py`): o prompt lista o que cada card da área mostra (id, página,
  título). Quando a resposta já está num card, o assistente consulta os números, chama `apontar_no_painel`
  (`secao`, `resumo`, opcionais `fila`/`unidade`, validados no servidor contra a área e a CRE) e, no texto, diz
  que o dado está no painel e pergunta se leva o servidor até lá. `POST /chat` devolve `navegacao {secao, pagina,
  titulo, rota, resumo}`; o frontend mostra "Sim, me leva até lá" / "Não, me responde aqui" — aceitou: navega,
  espera o card (`data-secao`, `<Card secao=…>`), rola com animação, destaca por 3 s e escreve o resumo no chat;
  recusou: só o resumo. Se nenhum card responde, o assistente responde direto, sem oferta.
- Configuração: `ANTHROPIC_API_KEY`, `CHAT_MODEL` (padrão `claude-opus-5`), `CHAT_MAX_TOOLS` (8). Sem chave, a
  rota responde 503 e o painel segue normal.

## Mensageria (`mensageria/`, container à parte, porta 8100)

Serviço de envio para o Eixo 3. A norma manda **1 tentativa por dia, 3 dias consecutivos, em horários
diferentes, por telefone, e-mail, WhatsApp ou SMS** ([02](02-case-oficial.md)) — isso é trabalho manual
do polo hoje, e é o que este serviço automatiza sem tocar em classificação.

Container separado do backend por três razões: credencial da Twilio/Resend isolada em um processo que não
fala com o banco; provedor fora do ar não derruba o painel nem o motor; trocar sandbox → WhatsApp Business
é variável de ambiente, sem redeploy do backend.

| Método | Rota (`/api/v1`) | Devolve |
|---|---|---|
| GET | `/saude` | provedor e credencial por canal, sem expor chave |
| GET | `/templates` | catálogo com `obrigatorios` e `opcionais` de cada mensagem |
| POST | `/enviar` | um envio |
| POST | `/enviar-lote` | vários em paralelo (teto de concorrência); devolve `invalidos` com a posição de cada pedido recusado |

- **Provedores por canal, padrão `mock`** (mesma convenção de `COMPROVACAO_PROVIDER`): `MENSAGERIA_WHATSAPP`
  (`mock`|`twilio`), `MENSAGERIA_EMAIL` (`mock`|`resend`|`smtp`), `MENSAGERIA_SMS` (`mock`|`twilio`). Subir o
  repositório limpo não manda mensagem para ninguém; sem credencial o resultado é `pendente`, nunca erro.
- **O texto mora aqui, não no backend** (`app/templates.py`): o backend manda `template` + `dados`. Assim a
  redação fica versionada em um lugar revisável pela SME, e a migração para template aprovado pela Meta
  (obrigatório no WhatsApp fora da janela de 24 h) é local a um arquivo.
- **Erro de programação falha alto, erro de mundo falha baixo**: template inexistente, dado faltando ou destino
  malformado → 422 antes de a mensagem existir; provedor recusando ou fora do ar → 200 com `resultado='falha'`.
- **Idempotência** por `chave_idem` (24 h): reprocessar uma convocação não manda dois avisos à mesma família.
  Memória do processo — em produção, Redis com a mesma interface (`app/idempotencia.py`).
- **LGPD art. 14**: o log é uma linha JSON por envio com destino **mascarado**, impressão digital (sha256
  truncado) e resultado — nunca assunto, texto, dados do template ou destino em claro. Mesmo princípio do
  `consulta_agente` do assistente.
- Cliente no backend: `backend/app/integracoes/mensageria.py` (`urllib` da stdlib, sem dependência nova, nunca
  levanta exceção). `enviar_para_contatos()` avisa em **todos** os canais cadastrados do pré-cadastro — contato
  desatualizado é a causa nº 1 de vaga que vence sem ninguém atender ([PRD](PRD.md), seção 3).

## ETL e auditoria (`backend/app/etl/`)

- `audit.py` — lê `data/` com DuckDB e escreve `out/auditoria-dados.md` + `.json`. Verifica as armadilhas
  de [03](03-dados-disponiveis.md) (BOM, CRLF, QueryD sem cabeçalho, `grupamento` com espaço, `situacao`
  sem acento), integridade das junções, domínios, duplicatas, faixas de lat/lon, régua por ano.
- `load.py` — carrega Postgres a partir do DuckDB já saneado. Idempotente (`TRUNCATE` + `COPY`).
- Nunca escreve em `data/`.

## Três painéis (frontend)

| Rota | Perfil | O que faz |
|---|---|---|
| `/` | — | escolha de perfil, sem login |
| `/familia` | **Família** (mobile-first) | consulta por código, vê opções/reservas/pontuação, confirma ou recusa uma reserva |
| `/cre` | **CRE / polo** | escolhe a CRE no primeiro acesso (lembrada); painel "Para hoje" com filas de trabalho clicáveis; convocações por fila com próxima ação; ficha com relógio, canal, histórico e "convocar próximo da fila"; crianças com várias reservas; unidade com fila de espera e capacidade informada; expiração em lote; "Registrando como" vira o `ator` do log |
| `/familia/pre-cadastro` | **Família sem inscrição** | pré-cadastro (jul–ago): pontuação e top 5 em tempo real, mapa com a casa e as creches, contatos múltiplos, até 5 escolhas |
| `/cre` | **CRE / polo** | painel e convocações do seu território (CRE selecionada e lembrada), registra contatos e desfechos |
| `/cre/mapa` · `/sme/mapa` | **CRE / polo** e **Nível Central** | mapa do território com drill-down: no Nível Central, uma bolha por CRE → clique abre **todas as creches da CRE** → clique numa creche mostra os números dela; na CRE, entra direto no nível da CRE escolhida. Quatro métricas (pressão da fila, convocações vencidas, lista de espera, vagas e matrículas), lista buscável e tabela completa |
| `/sme` | **Nível Central SME** | visão da rede por CRE, estado do motor contínuo (última passada, vagas repassadas, classificação vigente), régua do ano. **Não há aba "Classificação"**: o motor roda sozinho; `/sme/classificacao/{id}` continua abrindo o detalhe de uma rodada |

Header em todas: faixa branca com os logos Prefeitura Rio · Educação e Matrícula Carioca (`frontend/public/`), barra azul `#005E96` com a navegação do perfil.

## Estrutura

```
backend/     app/{main,config,db,models,schemas,motor}.py · app/routers/ · app/engine/ · app/etl/ · app/agente/ · app/integracoes/ · tests/ · Dockerfile
mensageria/  app/{main,config,schemas,servico,templates,destinos,idempotencia,registro}.py · app/provedores/ · tests/ · Dockerfile
frontend/    src/{design-system,api,pages,components}/ · Dockerfile (nginx)
db/          init/*.sql (schema versionado, aplicado pelo Postgres na subida)
out/         relatórios de auditoria (commitados; não vão para data/)
docker-compose.yml · .env.example · Makefile
```
