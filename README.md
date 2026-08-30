# Claude Impact Lab Rio #2 — Matrícula em Creche (SME-Rio)

Repositório do time para o desafio da **Secretaria Municipal de Educação do Rio (SME-Rio)**:
melhorar **Planejamento**, **Inscrição & Classificação** e **Convocação** do sistema de matrícula em creche (`matricula.rio`).

📅 30/08/2026 · VTEX, Botafogo · Rio de Janeiro

---

## Documentos

| Arquivo | O que é |
|---|---|
| [`00_BRIEFING_CONTEXTO.md`](00_BRIEFING_CONTEXTO.md) | Contexto institucional, legal (Res. SME 542/2025) e números da fila |
| [`01_CASE_ANALISE.md`](01_CASE_ANALISE.md) | Análise técnica dos 3 pilares e ângulos de ataque |

## Tese central

Os três pilares são o **mesmo defeito estrutural em três momentos**: oferta e demanda são tratadas como
listas independentes que se encontram por processo manual e sequencial, em vez de um **matching resolvido
de uma vez só, em software** (Deferred Acceptance / Gale-Shapley).

## Como contribuir

1. `git clone git@github.com:lkzppm/claude-impact-lab-rio-creche.git`
2. Crie uma branch: `git checkout -b sua-feature`
3. Abra um PR.

## Estrutura planejada

```
/docs      → briefing, case, decisões
/engine    → motor de matching (Deferred Acceptance)
/data      → dados sintéticos / amostras da SME
/app       → interface de demonstração
```
