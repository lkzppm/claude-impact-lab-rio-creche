# spec/ — Especificação do desafio SME-Rio

Base de conhecimento do time para o **Claude Impact Lab Rio #2** (30/08/2026, VTEX Botafogo).
Desafio proposto pela **Secretaria Municipal de Educação do Rio (SME-Rio)**: melhorar o processo de
**Inscrição Creche** — *Planejamento*, *Inscrição & Classificação* e *Convocação*.

> **Regra de precedência:** o que vem da SME (`fontes/`) manda. Os documentos curados abaixo
> interpretam e organizam esse material — quando divergirem da fonte, a fonte vence e o documento
> curado deve ser corrigido.

## Índice

| # | Documento | O que responde |
|---|---|---|
| 00 | [Evento e avaliação](00-evento-e-avaliacao.md) | Formato, banca, critérios, o que a premiação implica |
| 01 | [Contexto e legislação](01-contexto-e-legislacao.md) | Como funciona hoje, Res. SME 542/2025, pressão judicial, ecossistema de sistemas da Prefeitura |
| 02 | [Case oficial — os 3 eixos](02-case-oficial.md) | O desafio como a SME o enunciou, eixo a eixo |
| 03 | [Dados disponibilizados](03-dados-disponiveis.md) | Tabelas, campos, volumes e limites de anonimização |
| 04 | [Análise técnica](04-analise-tecnica.md) | Diagnóstico, causa raiz e o que construir em cada pilar |
| 05 | [Arquitetura, restrições e armadilhas](05-arquitetura-e-riscos.md) | Onde a IA entra, onde não entra, LGPD, o que mata o projeto na banca |
| 06 | [Glossário](06-glossario.md) | CRE, EDI, ICH, RMI, DA, CadÚnico, SINASC… |
| 07 | [Perguntas para a SME](07-perguntas-para-a-sme.md) | O que perguntar na abertura — respostas mudam o projeto |
| 08 | [Fontes](08-fontes.md) | Links de tudo que foi usado |
| 09 | [Achados dos dados](09-achados-dos-dados.md) | O que as bases 2021–2025 mostram — e o que elas não permitem |
| 10 | [Regras e entrega](10-regras-e-entrega.md) | Agenda, regras do hackathon, critérios de julgamento |
| 11 | [Resumo executivo dos dados](11-resumo-executivo-dados.md) | Uma página: o que tem, os 6 achados que mudam o pitch, o que os dados não permitem |

## Repositórios oficiais

| Repo | O que tem |
|---|---|
| [`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche) | **As bases de dados** (2021–2025), dicionário, nascidos vivos, microáreas, lat/long das unidades → copiadas para [`data/`](../data/), detalhadas em [03](03-dados-disponiveis.md) |
| [`taicor-ai/claude-impact-lab-rio-2`](https://github.com/taicor-ai/claude-impact-lab-rio-2) | **Regras do evento**, agenda, critérios de julgamento, formato da entrega → detalhado em [10](10-regras-e-entrega.md) |

## `fontes/` — material recebido da SME

| Arquivo | O que é |
|---|---|
| [`Briefing_SME.md`](fontes/Briefing_SME.md) | Briefing oficial do desafio, íntegra |
| [`Apresentacao_SME.pdf`](fontes/Apresentacao_SME.pdf) | Deck "Match Perfeito: Inteligência na Inscrição de Creche", 13 slides |
| [`Apresentacao_SME.transcricao.md`](fontes/Apresentacao_SME.transcricao.md) | Transcrição textual do deck (para busca e citação) |
