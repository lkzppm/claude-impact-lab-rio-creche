# Claude Impact Lab Rio #2 — Inscrição Creche (SME-Rio)

Repositório do time para o desafio da **Secretaria Municipal de Educação do Rio (SME-Rio)**:
melhorar o processo de **Inscrição Creche** (`matricula.rio`) em três eixos — **Planejamento**,
**Inscrição & Classificação** e **Convocação**.

📅 30/08/2026 · VTEX, Botafogo · Rio de Janeiro

**🔗 Aplicação publicada:** <https://creche-frontend-three.vercel.app/> · **🎥 Vídeo demo (60 s):** [`video/demo.mp4`](video/demo.mp4)

---

## A entrega

### Equipe

**Nome da equipe:** _(a definir)_ · **Grupo nº 42**

| Membro | GitHub |
|---|---|
| Lucas Pacheco | [@lkzppm](https://github.com/lkzppm) |
| Fausto Santos | — |
| Pedro Brasil | [@brpedro13](https://github.com/brpedro13) |
| Nay Borges | — |

### Resumo

A inscrição em creche do Rio trata **oferta e demanda como duas listas independentes**, reconciliadas por
processo manual e sequencial: a família escolhe até 5 creches, a equipe do polo confere linha a linha, e a
vaga que a família recusa volta para o fim de um processo humano. O resultado medido na base 2021–2025 é
um vazamento de **milhares de crianças por ano com vaga ofertada e sem matrícula efetivada**
([`spec/09`](spec/09-achados-dos-dados.md)).

Construímos o que falta no meio: um **motor de classificação e convocação que roda 24/7**. Ele aplica a
pontuação da **Res. SME 542/2025 sem alterar um único peso** — a norma é norma —, resolve o encontro entre
criança e vaga com **aceitação diferida (Deferred Acceptance)** de forma determinística e auditável,
reclassifica sozinho quando a entrada muda e **repassa cada vaga liberada ao próximo da fila** sem esperar
uma nova rodada manual. Em cima dele, dois painéis que um servidor não técnico opera sem treino — CRE/polo
e Nível Central — com **carimbo de tempo em cada evento** (o que hoje não existe), mapa do território com
drill-down e um **assistente Claude só de leitura** para perguntar ao painel em português.

Nada aqui pede app novo, mudança de norma ou sistema paralelo: encaixa no `matricula.rio`, no WhatsApp e
nos canais que a prefeitura já opera.

### Links

| | |
|---|---|
| 🔗 **Aplicação (frontend)** | <https://creche-frontend-three.vercel.app/> |
| 🎥 **Vídeo demo (60 s)** | [`video/demo.mp4`](video/demo.mp4) |
| 📦 **Repositório** | <https://github.com/lkzppm/claude-impact-lab-rio-creche> |
| 📄 **Produto (PRD)** | [`spec/PRD.md`](spec/PRD.md) |
| 🏗️ **Contrato técnico** | [`spec/11-baseline-tecnico.md`](spec/11-baseline-tecnico.md) |
| 🔍 **Auditoria das bases** | [`out/auditoria-dados.md`](out/auditoria-dados.md) |

> **Honestidade sobre o que está publicado:** o link acima serve o **frontend**. O backend, o Postgres e a
> mensageria **não estão publicados** — o `render.yaml` está pronto, mas subir banco e carga das bases da
> SME não cabia no tempo do evento. Por isso o **vídeo de 60 s é a demonstração oficial** do sistema
> completo, e a stack inteira sobe localmente com um comando (`make up`, abaixo).

---

## Comece pela spec

Todo o contexto do desafio está em **[`spec/`](spec/)** — comece pelo
**[índice](spec/README.md)**.

| # | Documento | O que responde |
|---|---|---|
| 00 | [Evento e avaliação](spec/00-evento-e-avaliacao.md) | Formato, banca, o que a premiação implica |
| 01 | [Contexto e legislação](spec/01-contexto-e-legislacao.md) | Como funciona hoje, Res. SME 542/2025, pressão judicial |
| 02 | [Case oficial](spec/02-case-oficial.md) | O desafio como a SME o enunciou, eixo a eixo |
| 03 | [Dados disponibilizados](spec/03-dados-disponiveis.md) | Tabelas, campos, volumes, anonimização |
| 04 | [Análise técnica](spec/04-analise-tecnica.md) | Diagnóstico e o que construir em cada pilar |
| 05 | [Arquitetura e riscos](spec/05-arquitetura-e-riscos.md) | Onde a IA entra, onde não entra, o que mata o projeto na banca |
| 06 | [Glossário](spec/06-glossario.md) | CRE, EDI, ICH, RMI, DA, CadÚnico… |
| 07 | [Perguntas para a SME](spec/07-perguntas-para-a-sme.md) | O que perguntar na abertura |
| 08 | [Fontes](spec/08-fontes.md) | Links de tudo que foi usado |
| 09 | [Achados dos dados](spec/09-achados-dos-dados.md) | O que as bases 2021–2025 mostram — e o que não permitem |
| 10 | [Regras e entrega](spec/10-regras-e-entrega.md) | Agenda, regras, critérios de julgamento |

O material original recebido da SME (briefing + deck) está em [`spec/fontes/`](spec/fontes/).

## Os dados

As bases da SME estão em **[`data/`](data/)** (36 MB, cópia byte a byte de
[`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche)) — 837 mil opções de inscrição,
4,3 milhões de respostas socioeconômicas, a régua de pontuação de cada ano, lat/long das unidades,
microáreas SME/IPP e nascidos vivos por bairro.

Antes de abrir qualquer arquivo, leia as [armadilhas da base](spec/03-dados-disponiveis.md#armadilhas-práticas-custam-horas-se-descobertas-às-15h)
— CRLF, BOM, cabeçalho ausente e um acento faltando que faz um filtro devolver zero linhas em silêncio.

As regras do evento estão em [`taicor-ai/claude-impact-lab-rio-2`](https://github.com/taicor-ai/claude-impact-lab-rio-2),
resumidas em [`spec/10`](spec/10-regras-e-entrega.md).

## O que está construído (baseline)

Escopo atual: **motor de classificação por criança** (Deferred Acceptance com 3 vagas reservadas + 2
alternativas, comparável a 1 vaga), rodando **24/7** — reclassifica quando a entrada muda, convoca e
repassa cada vaga liberada ao próximo da fila sozinho — e **painel de convocação da CRE/polo** com log de
eventos, incluindo o **mapa do território com drill-down** (rede → CRE → creche).
Produto em [`spec/PRD.md`](spec/PRD.md); contrato técnico em [`spec/11`](spec/11-baseline-tecnico.md);
auditoria das bases em [`out/auditoria-dados.md`](out/auditoria-dados.md).

```bash
cp .env.example .env
make up                      # Postgres 16 + API FastAPI (:8000/docs) + frontend React (:5173)
make venv && make load       # carrega as bases da SME no Postgres (todos os anos; --anos 2025 para só um)
make seed                    # dados de demonstração: classificação + 5 dias de convocação simulados (SEED_ARGS="--limpar")
make audit                   # regera out/auditoria-dados.md
make test                    # invariantes do motor
```

| Pasta | O que é |
|---|---|
| [`backend/`](backend/) | FastAPI · motor DA em `app/engine` · rotina contínua do motor em `app/motor.py` · ETL (DuckDB) em `app/etl` · comprovação via APIs de governo em `app/integracoes` · assistente de consulta em `app/agente` |
| [`frontend/`](frontend/) | React + Vite + TS, design system espelhando o `matricula.rio` |
| [`mensageria/`](mensageria/) | FastAPI à parte: WhatsApp/e-mail/SMS com catálogo versionado, idempotência e log sem conteúdo (padrão `mock`) |
| [`db/`](db/) | schema SQL (log de eventos append-only; log de acesso do assistente) |
| [`video/`](video/) | vídeo demo de 60 s (`demo.mp4`) — ver [`video/README.md`](video/README.md) |

### Como o Claude atua dentro da aplicação

**IA na borda, algoritmo determinístico no núcleo.** Quem decide vaga é o motor de aceitação diferida sobre a
pontuação da Res. SME 542/2025 — sem LLM. O Claude entra como **assistente de consulta** nos painéis da CRE/polo e do
Nível Central (botão "Perguntar ao painel"): o servidor pergunta em português ("quais convocações vencem hoje na
minha CRE?", "qual CRE tem mais atraso?") e o Claude responde chamando **ferramentas só de leitura** sobre o mesmo
banco que alimenta as telas (resumo do painel, convocações, ficha da inscrição, capacidade, rodadas, régua e, só no
Nível Central, um SELECT livre em transação `READ ONLY`). Cada consulta feita aparece na conversa ("consultou: resumo
do painel · 4ª CRE"); na área da CRE o servidor força o território de quem pergunta; dado de criança é anonimizado e
devolvido agregado por padrão; cada turno grava um log de acesso append-only (`consulta_agente`) sem o texto da
pergunta. Quando a resposta já está num card do painel, o Claude não repete a tela: avisa que o dado está lá e
pergunta se leva o servidor até ele — aceitou, a página navega, rola até o card, destaca por alguns segundos e o
resumo aparece no chat (`app/agente/secoes.py` mapeia o que cada card mostra; a ferramenta `apontar_no_painel` é
validada no servidor). O assistente não registra contato, não confirma matrícula e não altera pontuação — e é
opcional: sem `ANTHROPIC_API_KEY`, os painéis funcionam sem ele. Detalhes em [`backend/README.md`](backend/README.md#assistente-chat-com-tools--appagente).

**Como o Claude foi usado para construir.** O repositório foi desenvolvido com Claude Code a partir da base de
conhecimento em `spec/` (o `CLAUDE.md` define a precedência: fonte da SME > documento curado > conhecimento do
modelo): leitura e auditoria das bases da SME, motor DA e seus invariantes, API, painéis e este assistente.

## Tese central

Os três eixos são o **mesmo defeito estrutural em três momentos**: oferta e demanda são tratadas como
listas independentes que se encontram por processo manual e sequencial, em vez de um **matching resolvido
de uma vez só, em software** (Deferred Acceptance / Gale-Shapley).

## Como contribuir

```bash
git clone git@github.com:lkzppm/claude-impact-lab-rio-creche.git
cd claude-impact-lab-rio-creche
git checkout develop
git checkout -b sua-feature
```

Abra o PR contra `develop`. `main` só recebe merge de `develop`.

Trabalhando com Claude Code neste repo? Leia o [`CLAUDE.md`](CLAUDE.md) — ele define como usar a `spec/`
como contexto.
