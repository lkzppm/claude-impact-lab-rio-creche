# Claude Impact Lab Rio #2 — Inscrição Creche (SME-Rio)

Repositório do time para o desafio da **Secretaria Municipal de Educação do Rio (SME-Rio)**:
melhorar o processo de **Inscrição Creche** (`matricula.rio`) em três eixos — **Planejamento**,
**Inscrição & Classificação** e **Convocação**.

📅 30/08/2026 · VTEX, Botafogo · Rio de Janeiro

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

O material original recebido da SME (briefing + deck) está em [`spec/fontes/`](spec/fontes/).

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
