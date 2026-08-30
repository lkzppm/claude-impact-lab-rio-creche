# Claude Impact Lab Rio #2 — Inscrição Creche (SME-Rio)

Projeto do time para o desafio da **Secretaria Municipal de Educação do Rio**: melhorar o processo de
**Inscrição Creche** em três eixos — Planejamento, Inscrição & Classificação, Convocação.

## Antes de qualquer coisa: leia a `spec/`

`spec/` é a base de conhecimento do projeto. **Toda sessão começa por ela.**

1. Leia sempre [`spec/README.md`](spec/README.md) — é o índice.
2. Carregue os documentos relevantes à tarefa em vez de todos:

| Se a tarefa é… | Leia |
|---|---|
| Entender o problema / escrever pitch | `spec/02-case-oficial.md`, `spec/04-analise-tecnica.md` |
| Mexer em pontuação, prazos ou regra de negócio | `spec/01-contexto-e-legislacao.md` (**a norma manda**) |
| Escrever código que lê a base da SME | `spec/03-dados-disponiveis.md` (**leia as armadilhas antes de abrir o CSV**); os arquivos estão em `data/` |
| Citar um número sobre a fila, a rede ou a base | `spec/09-achados-dos-dados.md` |
| Decidir escopo, priorizar, ou preparar o pitch | `spec/10-regras-e-entrega.md` (Impacto Real vale 40 de 100) |
| Decidir onde usar LLM e onde não usar | `spec/05-arquitetura-e-riscos.md` |
| Encontrar uma sigla | `spec/06-glossario.md` |
| Mexer em backend, frontend, banco ou API | `spec/11-baseline-tecnico.md` (**é o contrato**) e `spec/PRD.md` |
| Saber o que a base tem de ruído e como foi tratado | `out/auditoria-dados.md` (gerado por `backend/app/etl/audit.py`) |
| Citar um número ou uma fonte | `spec/08-fontes.md` |

## Precedência das informações

1. **`spec/fontes/`** — material recebido da SME (briefing + deck) e os dois repositórios oficiais:
   [`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche) (dados) e
   [`taicor-ai/claude-impact-lab-rio-2`](https://github.com/taicor-ai/claude-impact-lab-rio-2) (regras).
   É a fonte da verdade.
2. **`spec/*.md`** — documentos curados que organizam e interpretam as fontes.
3. Conhecimento geral do modelo — último recurso, e sempre marcado como suposição.

> Se um documento curado divergir de `spec/fontes/`, **a fonte vence**: corrija o documento curado
> na mesma sessão e diga o que mudou.

## Regras de conteúdo

- **Não invente número.** Todo dado quantitativo sobre a rede, a fila ou a base deve sair da `spec/`
  com referência ao documento. Se não estiver lá, escreva "não temos esse dado" — a lacuna é um achado.
- **A tabela de pontuação é norma** (Res. SME 542/2025), não parâmetro de código. Nenhuma solução altera
  quem tem prioridade. Propor mudar os pesos mata o projeto na banca.
- **A régua de pontuação muda a cada ano.** Ao analisar a base 2021–2025, sempre junte a QueryB com a
  QueryC daquele processo (`ano` + `ich_perg_id`). Nunca aplique a tabela de um ano a outro — entre 2023 e
  2024 só 3 das 13 perguntas sobreviveram. E a régua do dataset (até o processo 195/2025) **não é** a da
  Res. 542/2025, que rege o processo de 2026 e não está na base.
- **Trate as armadilhas da base como requisito, não como chateação.** CRLF em todas as linhas,
  `Cancelado na confirmacao` sem cedilha nem til, QueryD sem cabeçalho, `grupamento` com espaço à direita,
  BOM no início do arquivo. "Lida com dado ruidoso" é literalmente o descritor de nota 4 em Engenharia.
- **Não confunda o que a base mede com o que aconteceu.** Não há histórico de mudança de status, nem vagas
  ofertadas, nem contato da família. A coluna `confirmado` vira ruído a partir de 2022. Antes de afirmar
  um número, cheque `spec/09-achados-dos-dados.md`, seção 7.
- **IA na borda, algoritmo determinístico no núcleo.** Alocação de vaga é Deferred Acceptance auditável,
  nunca LLM. LLM entra em conversa com a família, leitura de documento (com human-in-the-loop),
  explicação do resultado e interrogação do gestor.
- **Dado sensível de criança vulnerável.** LGPD art. 14 e ECA valem aqui. Minimização, retenção curta e
  log de acesso são requisito, não enfeite. Nada de dado real de criança em prompt de exemplo.
- **Nada de app novo.** O público-alvo tem baixa conectividade. WhatsApp, 1746, Carioca Digital e Rioeduca
  já existem — a solução se encaixa neles.

## Ao atualizar a spec

- Documento novo entra no índice de `spec/README.md` **e** na tabela de rota acima.
- Arquivo recebido da SME vai íntegro para `spec/fontes/`, sem edição. A interpretação vai em documento curado.
- Prefira editar o documento existente a criar um paralelo.

## Estrutura do repositório

```
spec/            base de conhecimento (comece aqui)
spec/fontes/     material original da SME — não editar
data/            bases da SME, cópia byte a byte do repo oficial — não editar
backend/         FastAPI + SQLAlchemy; app/engine (motor DA), app/etl (leitura, auditoria, carga), app/integracoes (comprovação)
frontend/        React + Vite + TS; design system espelhando o matricula.rio em src/design-system
db/              schema SQL versionado, aplicado pelo Postgres na subida
out/             relatórios gerados (auditoria dos dados) — commitados
docker-compose.yml  db (Postgres 16) + backend + frontend
```

Ambiente Python local: `.venv/` na raiz (`python3 -m venv .venv && .venv/bin/pip install -e backend[dev]`).
Auditoria dos dados: `cd backend && ../.venv/bin/python -m app.etl.audit` → `out/auditoria-dados.md`.

Pastas de código (`engine/`, `app/`) são criadas conforme o projeto avança; ao criar uma, registre-a aqui
em uma linha.

**`data/` é imutável.** É a cópia da fonte oficial, com checksums registrados em `data/README.md`. Saída
de análise nunca vai para lá — crie a pasta que fizer sentido (`engine/`, `notebooks/`, `out/`) e escreva
nela. Se descompactar os `.csv.gz`, os `.csv` já estão no `.gitignore`.

## Entrega (regras do evento)

- Repositório **público**; primeiro commit **após 09h00 de 30/08** (este repo: 09h44 ✅).
- Prazo **16h30**, por e-mail para **eventos@taicor.ai** com o número do grupo no assunto e no corpo.
- O README de entrega precisa ter: nome da equipe, membros, resumo, arquitetura (**incluindo como o Claude
  foi usado para construir e como ele atua dentro da aplicação**), links e vídeo demo de 60s — obrigatório
  se a aplicação não estiver publicamente acessível.
- Detalhes e a régua de julgamento em `spec/10-regras-e-entrega.md`.

## Git

- Branch de trabalho: `develop`. `main` recebe merge via PR.
- Mensagens de commit em português, no imperativo.
