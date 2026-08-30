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
| Escrever código que lê a base da SME | `spec/03-dados-disponiveis.md` |
| Decidir onde usar LLM e onde não usar | `spec/05-arquitetura-e-riscos.md` |
| Encontrar uma sigla | `spec/06-glossario.md` |
| Citar um número ou uma fonte | `spec/08-fontes.md` |

## Precedência das informações

1. **`spec/fontes/`** — material recebido da SME (briefing + deck). É a fonte da verdade.
2. **`spec/*.md`** — documentos curados que organizam e interpretam as fontes.
3. Conhecimento geral do modelo — último recurso, e sempre marcado como suposição.

> Se um documento curado divergir de `spec/fontes/`, **a fonte vence**: corrija o documento curado
> na mesma sessão e diga o que mudou.

## Regras de conteúdo

- **Não invente número.** Todo dado quantitativo sobre a rede, a fila ou a base deve sair da `spec/`
  com referência ao documento. Se não estiver lá, escreva "não temos esse dado" — a lacuna é um achado.
- **A tabela de pontuação é norma** (Res. SME 542/2025), não parâmetro de código. Nenhuma solução altera
  quem tem prioridade. Propor mudar os pesos mata o projeto na banca.
- **A régua de pontuação muda a cada ano.** Ao analisar a base 2021–2025, sempre junte com o catálogo de
  perguntas daquele processo. Nunca aplique a tabela de 2025 a dados de 2022.
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
```

Pastas de código (`engine/`, `data/`, `app/`) são criadas conforme o projeto avança; ao criar uma,
registre-a aqui em uma linha.

## Git

- Branch de trabalho: `develop`. `main` recebe merge via PR.
- Mensagens de commit em português, no imperativo.
