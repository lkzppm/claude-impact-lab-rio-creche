# 11 — Resumo executivo dos dados

Uma página com os números que importam. Fonte: [`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche),
espelhado em [`data/`](../data/). Detalhe completo em [03](03-dados-disponiveis.md) (dicionário) e
[09](09-achados-dos-dados.md) (análises).

> ⚠️ Dados **anonimizados** (aleatorização, generalização, supressão). Indicadores absolutos não
> representam a realidade — servem para mecanismo e ordem de grandeza.

---

## O que tem, em uma tabela

| Bloco | Arquivo(s) | Grão / conteúdo | Volume |
|---|---|---|---|
| Inscrição | `01_QueryA_InscricoesPorAno.csv.gz` | 1 opção de creche escolhida | 837.179 linhas · 343.308 inscrições · 259.924 crianças · 872 unidades |
| Respostas socioeconômicas | `02_QueryB_RespostasSocioEconomicas.csv.gz` | 1 pergunta respondida | 4.357.119 linhas |
| Régua de pontuação | `03_QueryC_PerguntasComDescricao.csv` | 1 pergunta por processo/ano | 65 linhas · 24 perguntas distintas |
| Unidades escolares | `04_UnidadesEscolaresComEndereco.csv` | 1 unidade, com endereço | 2.188 unidades (872 usadas) |
| Unidades com geolocalização | `Unidades_Unificadas_com_Localizacao.xlsx` | Lat/long, CRE, microárea, tipo | 1.941 unidades — **arquivo mais subestimado do pacote** |
| Ocupação | `totalalunoscreche2021…2025.xlsx` | Alunos/turmas por unidade e grupamento | ~1.558 unidades/ano |
| Creches parceiras | `Parceiras2021…2025.xlsx` | Consolidado mensal por CRE | ~350 unidades |
| Território | shapefile `Microáreas_SME_revisãoIPP/` | Organização territorial oficial da SME | mais fina que bairro |
| Nascidos vivos | `NascidosvivosRJ.xlsx` | SINASC por bairro de residência da mãe | 2016–2026 · 168 bairros |

**Cobertura temporal:** 5 processos — `prm_id` 179 (2021), 181 (2022), 184 (2023), 194 (2024), 195 (2025).
**2026 (processo vigente, sob a Res. SME 542/2025) não está no dataset.**

---

## Os 6 achados que mudam o pitch

1. **Família subusa as opções.** 47% das inscrições de 2025 marcaram só 1 creche (das 5 possíveis) — em
   2021 eram 29%. Conversão cai forte por ordem: 1ª opção converte muito mais que a 5ª.
2. **O maior vazamento é pós-classificação.** 118.816 opções (14,2%) são `Cancelado na confirmacao` —
   vaga foi ofertada e não virou matrícula. 104.343 crianças (82,3% das afetadas) terminam **sem vaga
   nenhuma**. Taxa caindo (17,8% → 9,5% de 2021 a 2025), mas ainda ~6 mil crianças/ano.
3. **Escolher fora do bairro custa quase metade da chance.** Confirmação 27,1% (mesmo bairro) vs 18,8%
   (bairro diferente) — e quase metade das escolhas (47,5%) é fora do bairro.
4. **Comprovação de critério é praticamente cega.** Campo `confirmado` discriminava em 2021 (88,9% vs
   29,6%); de 2022 em diante virou ruído (~8% para `Sim` e `Nao`). Em 2025, só 6,8% das declarações de
   CadÚnico (51 pts) foram confirmadas. Ambíguo se é perda real de pontuação ou falha de registro — é a
   pergunta nº 1 para a SME.
5. **A régua de pontuação mudou duas vezes** (2021–23 → 2024 → 2025) e a de 2025 **não é** a da
   Res. 542/2025 (que rege 2026, fora do dataset). Nunca aplicar régua de um ano a outro.
6. **A coorte 0–3 encolhe -29% em 8 anos** (2016–2025), de forma desigual por bairro (Bangu -42%,
   Complexo da Maré +17%). Cobertura de creche ~50% da coorte relevante — sobram ~77 mil crianças 0–3
   fora de matrícula e fora da fila.

---

## O que os dados NÃO permitem

- Sem histórico de mudança de status (só existe `data_criacao`) — impossível medir duração de convocação.
- Sem vagas ofertadas por unidade/turma no processo (só ocupação e confirmações — capacidade é estimada).
- Sem endereço da família (só bairro/CEP) e sem telefone/e-mail.
- Contagem por criança tem erro conhecido quando falta CPF/DNV/NIS (colisão nome+nascimento).

---

## Armadilhas técnicas mais caras (ver lista completa em [03](03-dados-disponiveis.md#armadilhas-práticas-custam-horas-se-descobertas-às-15h))

`"Cancelado na confirmacao"` sem cedilha/til · CRLF em todos os CSV · BOM (`utf-8-sig`) ·
QueryB não cabe no Excel (4,36 M linhas) · QueryD sem cabeçalho.
