# 03 — Dados disponibilizados

**As bases estão neste repositório, em [`data/`](../data/)** — cópia byte a byte do repositório oficial
[`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche) (commit `057b975`), com os diretórios
renomeados para caminhos sem espaço nem acento. Mapeamento e checksums em [`data/README.md`](../data/README.md).

| Aqui | No upstream |
|---|---|
| `data/inscricoes/` | `Bases IC_ ClassificadoseFila/` |
| `data/oferta/` | `OferecimentosEvagas/` |
| `data/territorio/` | `Microáreas_SME_revisãoIPP/` |
| `data/nascidos_vivos/` | `NascidosvivosRJ.xlsx` (raiz) |

Cobre **5 processos seletivos**: `prm_id` **179** (2021), **181** (2022), **184** (2023), **194** (2024),
**195** (2025). O processo vigente (2026) **não** está incluído.

> ⚠️ **Aviso da SME:** os dados passaram por anonimização com aleatorização, generalização e supressão.
> **Indicadores absolutos não representam a realidade** — ilustram as dinâmicas do módulo.
> Use para entender mecanismo e ordem de grandeza, não para afirmar número oficial.

---

## Inventário do repositório

| Pasta / arquivo | Conteúdo | Tamanho |
|---|---|---|
| `Bases IC_ ClassificadoseFila/` | Inscrição, respostas, régua de pontuação, unidades | 4 arquivos |
| `OferecimentosEvagas/` | Ocupação por unidade/grupamento, parceiras, **lat/long das unidades** | 12 planilhas |
| `Microáreas_SME_revisãoIPP/` | **Shapefile** da organização territorial SME/IPP | `.shp` + índices |
| `NascidosvivosRJ.xlsx` | **Nascidos vivos por bairro de residência, 2016–2026** | 168 bairros |

Materiais de apoio linkados no repo: [apresentação](https://rioeduca-my.sharepoint.com/:p:/g/personal/gabrielledomingues_rioeduca_net/IQAlvS8n9w7OQ6WcJK2T-wr6AVcXGJuT7MdyJ41qQtqlff0?e=xkQwfk)
e [briefing completo](https://docs.google.com/document/d/1jZenYEKR2hJOVrxLXWM0xjxmoiohAqEl/edit) — ambos
já espelhados em [`fontes/`](fontes/).

---

## 1. Bases de inscrição e classificação

Separador `;`, encoding **UTF-8 com BOM**, quebras de linha **CRLF** (limpe o `\r` antes de comparar strings).

| Arquivo | Linhas | Grão | Tamanho descompactado |
|---|---:|---|---|
| `01_QueryA_InscricoesPorAno.csv.gz` | 837.179 | uma **opção de creche** escolhida | 154 MB |
| `02_QueryB_RespostasSocioEconomicas.csv.gz` | 4.357.119 | uma **pergunta respondida** | 436 MB |
| `03_QueryC_PerguntasComDescricao.csv` | 65 | uma **pergunta por processo/ano** | — |
| `04_UnidadesEscolaresComEndereco.csv` | 2.188 | uma **unidade escolar** | — |

### Modelo de dados

```
QueryA (opção)  ──(prm_id, plm_id, ipl_id)──  QueryB (resposta)
     │                                              │
     │ unidade = esc_codigo                         │ ich_perg_id (+ ano)
     ▼                                              ▼
QueryD (unidade escolar)                    QueryC (catálogo + pontuação)
```

- **QueryA ↔ QueryB:** `(prm_id, plm_id, ipl_id)` — a chave da inscrição.
- **QueryB ↔ QueryC:** `(ano, ich_perg_id)`. Use `perg_id` para seguir a **mesma pergunta entre anos**.
- **QueryA ↔ QueryD:** `QueryA.unidade` = **coluna 1 (0-indexed)** da QueryD. Casa 872/872.

### Query A — `01_QueryA_InscricoesPorAno`

343.308 inscrições, 259.924 crianças, 872 unidades.

| Coluna | Descrição |
|---|---|
| `ano`, `prm_id`, `plm_id`, `ipl_id` | Processo, polo/lote, inscrição |
| `opcao` | Ordem da opção (1ª a 5ª — há 11 linhas com `opcao = 6`) |
| `unidade`, `nome_unidade` | Código e nome da unidade escolar |
| `grupamento` | Berçário, Maternal I, Maternal II (vem com **espaço à direita**, ex.: `"Maternal II "`) |
| `horario` | `Integral` ou `Parcial` |
| `data_criacao` | Data/hora da inscrição — **o único carimbo de tempo da base** |
| `aluno_anon` | Código da criança, **estável entre opções e entre os 5 anos** |
| `sexo_crianca` | `M` (439.690) / `F` (397.489), sem nulos |
| `nascimento_aluno_anomes` | `yyyy-MM` — sem o dia |
| `responsavel_anon` | Código do responsável 1 |
| `CEP`, `bairro` | Endereço do responsável — nulos em **2,8%** |
| `situacao` | Desfecho da opção — ver abaixo |

**A base não vem filtrada por situação.** Os cancelamentos são a maioria:

| `situacao` | Linhas | % |
|---|---:|---:|
| `Cancelado pelo sistema` | 326.316 | 39,0% |
| `Confirmado` | 192.570 | 23,0% |
| `Lista de espera` | 178.731 | 21,3% |
| `Cancelado na confirmacao` | 118.816 | 14,2% |
| `Cancelado` | 18.722 | 2,2% |
| `Selecionado da lista` | 1.191 | 0,1% |
| `Ativo` | 606 | 0,1% |
| `Selecionado` | 227 | 0,0% |

### Query B — `02_QueryB_RespostasSocioEconomicas`

Formato longo, uma linha por pergunta respondida. Chave `(prm_id, plm_id, ipl_id, ich_perg_id)`.
Colunas: `ano`, chave da inscrição, `ich_perg_id`, `pergunta_texto`, `pergunta_legenda` (**100% nula**),
`pergunta_ordem`, `resposta` (`Sim`/`Nao`), `confirmado` (`Sim`/`Nao`).

Junção com a QueryA: só **221 de 4.357.119** linhas ficam órfãs; na direção oposta, **8.162 de 343.308**
inscrições (2,4%) não têm nenhuma resposta.

### Query C — `03_QueryC_PerguntasComDescricao`

**É a régua de pontuação.** 13 perguntas por ano, 24 distintas nos 5 anos. `perg_pontuacao` (0–100) é o
peso; `perg_criterio = Sim` marca pergunta usada só como desempate (equivale exatamente a pontuação 0).

### Query D — `04_UnidadesEscolaresComEndereco`

2.188 unidades, das quais 872 aparecem na QueryA.

> ⚠️ **Não tem linha de cabeçalho.** Leia com `header=None`, senão você perde a primeira unidade.

```python
import pandas as pd
d = pd.read_csv("04_UnidadesEscolaresComEndereco.csv", sep=";", header=None,
                encoding="utf-8-sig", na_values=["NULL"],
                names=["seq","esc_codigo","nome","tipo","logradouro",
                       "numero","complemento","bairro","cep"])
```

Posição 0 é sequencial interno e **não junta com nada** — a chave é a posição 1. Logradouro, número,
bairro e CEP vêm vazios em 258 linhas.

---

## 2. Oferecimento e vagas (`OferecimentosEvagas/`)

| Arquivo | Conteúdo |
|---|---|
| **`Unidades_Unificadas_com_Localizacao.xlsx`** | **1.941 unidades com `LATITUDE`, `LONGITUDE`, `CRE`, `microárea`, bairro e tipo (CDEI, CIEP, CM, EM…)**. Aba 2: 1.914 unidades com CRE, endereço, microárea e **polo** |
| `totalalunoscreche2021…2025.xlsx` | Ocupação por unidade e grupamento — colunas `Aluno` e `Turma` por Berçário / Maternal I / Maternal II. ~1.558 unidades. Fonte: Sistema de Gestão Acadêmica, atualização dinâmica |
| `Parceiras2021…2025.xlsx` | ~350 creches parceiras com designação, nome, endereço e bairro. Consolidados **mensais** enviados pelas CREs, com ~1 mês de defasagem |

> **Este é o arquivo mais subestimado do pacote:** `Unidades_Unificadas_com_Localizacao.xlsx` traz
> **lat/long reais**. Distância porta-a-porta, raio de captação e mapa de cobertura são calculáveis —
> só o lado da família é que fica em bairro/CEP.

## 3. Microáreas SME/IPP (`Microáreas_SME_revisãoIPP/`)

Shapefile completo (`.shp`, `.dbf`, `.shx`, `.prj`, `.sbn`, `.sbx`, `.cpg`) com a organização territorial
que a SME usa de verdade. É a unidade geográfica certa para agregar oferta e demanda — mais fina que
bairro e alinhada à operação das CREs.

## 4. Nascidos vivos (`NascidosvivosRJ.xlsx`)

Nascimentos **por bairro de residência da mãe**, 2016 a 2026, 168 bairros. É o SINASC municipal — o
denominador real da demanda, com 3 anos de antecedência. **2026 está parcial** (33.306 até a extração).

---

## Anonimização — limites a respeitar

| ❌ O que **NÃO** representa a realidade | ✅ O que **está preservado** |
|---|---|
| Indicadores absolutos | Sequência temporal do processo (inscrição → classificação → convocação) |
| Endereço exato das famílias (só bairro/CEP) | A **trajetória da mesma criança entre anos** — 34.486 crianças (13,3%) reaparecem em mais de um processo |
| Identidade real de crianças e responsáveis | Lógica territorial ao nível de bairro (e lat/long **das unidades**) |
| Data exata de nascimento (só `yyyy-MM`) | As relações entre as bases |

Chave natural usada para gerar o código da criança: CPF → DNV → NIS → nome normalizado + nascimento.
Para o responsável: NIS → nome + nascimento. Quando falta CPF/DNV/NIS, o agrupamento por nome+nascimento
pode **misturar crianças distintas** — é o gap de colisão que a própria SME reconhece.

---

## Armadilhas práticas (custam horas se descobertas às 15h)

1. **`Cancelado na confirmacao` não tem cedilha nem til.** Filtrar por `"Cancelado na confirmação"`
   devolve **zero linhas**.
2. **CRLF.** Todos os CSV usam `\r\n`. Sem `tr -d '\r'` (ou `lineterminator` correto), a **última coluna**
   — justamente `situacao` — vem com `\r` grudado e toda comparação de string falha em silêncio.
3. **BOM.** Use `encoding="utf-8-sig"`, senão a primeira coluna vira `\ufeffano`.
4. **A QueryB não cabe no Excel** (4,36 M linhas > 1.048.576) e abre truncada sem aviso. Use DuckDB,
   pandas com `chunksize`, ou awk direto no `.gz`.
5. **A QueryD não tem cabeçalho** (ver acima).
6. **`grupamento` tem espaço à direita** — `strip()` antes de agrupar.
7. **Nunca aplique a régua de um ano a outro ano.** Ver [09](09-achados-dos-dados.md#a-régua-mudou-duas-vezes).

Leitura sem descompactar:

```python
import pandas as pd
a = pd.read_csv("01_QueryA_InscricoesPorAno.csv.gz", sep=";", encoding="utf-8-sig")
```
```sql
-- DuckDB: lê o .gz direto e só materializa o resultado
SELECT * FROM read_csv_auto('02_QueryB_RespostasSocioEconomicas.csv.gz', delim=';');
```
