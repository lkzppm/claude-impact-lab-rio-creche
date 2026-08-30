# data/ — Bases da SME-Rio

Cópia local das bases fornecidas pela Secretaria Municipal de Educação para o hackathon.

**Origem:** [`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche) · commit `057b975` ·
copiado em 30/08/2026. Os arquivos são **byte a byte idênticos** ao upstream (só os diretórios foram
renomeados — ver mapeamento abaixo).

> ⚠️ **Aviso da SME:** os dados passaram por anonimização com aleatorização, generalização e supressão.
> **Indicadores absolutos não representam a realidade.** Servem para entender a dinâmica do processo,
> não para afirmar número oficial.

**Como interpretar estes arquivos:** [`../spec/03-dados-disponiveis.md`](../spec/03-dados-disponiveis.md)
— schemas, chaves de junção e as armadilhas que custam horas.
**O que já foi apurado deles:** [`../spec/09-achados-dos-dados.md`](../spec/09-achados-dos-dados.md).

---

## O que tem aqui

| Caminho | Conteúdo |
|---|---|
| `inscricoes/01_QueryA_InscricoesPorAno.csv.gz` | 837.179 linhas — uma **opção de creche escolhida** |
| `inscricoes/02_QueryB_RespostasSocioEconomicas.csv.gz` | 4.357.119 linhas — uma **pergunta respondida** |
| `inscricoes/03_QueryC_PerguntasComDescricao.csv` | 65 linhas — a **régua de pontuação** de cada ano |
| `inscricoes/04_UnidadesEscolaresComEndereco.csv` | 2.188 unidades — **sem linha de cabeçalho** |
| `inscricoes/README_dicionario_dados.md` | Dicionário de dados detalhado, da SME |
| `inscricoes/SME_Processo_Inscricao_Creche_parametrizacoes.docx` | Visão da retaguarda: planejamento, parametrização, classificação e convocação |
| `oferta/Unidades_Unificadas_com_Localizacao.xlsx` | **1.941 unidades com latitude/longitude**, CRE, microárea e tipo |
| `oferta/totalalunoscreche20XX.xlsx` | Ocupação por unidade e grupamento (`Aluno`, `Turma`) |
| `oferta/Parceiras20XX.xlsx` | ~350 creches parceiras, consolidado mensal das CREs |
| `territorio/Microareas_SME_revisao.shp` | Shapefile das microáreas SME/IPP |
| `nascidos_vivos/NascidosvivosRJ.xlsx` | Nascidos vivos por bairro de residência, 2016–2026 |
| `DICIONARIO_SME.md` | README oficial do repositório da SME, na íntegra |

## Mapeamento com o repositório da SME

Os diretórios foram renomeados porque os originais têm espaços e acentos, o que quebra script de shell.
**Os nomes dos arquivos são os originais**, para bater com o dicionário da SME.

| Aqui | No upstream |
|---|---|
| `inscricoes/` | `Bases IC_ ClassificadoseFila/` |
| `oferta/` | `OferecimentosEvagas/` |
| `territorio/` | `Microáreas_SME_revisãoIPP/` |
| `nascidos_vivos/NascidosvivosRJ.xlsx` | `NascidosvivosRJ.xlsx` (raiz) |
| `DICIONARIO_SME.md` | `README.md` (raiz) |
| `inscricoes/SME_..._parametrizacoes.docx` | `..._parametrizações.docx` (só o acento saiu) |

Uma exceção de nome vem da própria SME: `oferta/totaalunoscreche2025.xlsx` tem "tota**a**lunos", enquanto
os outros anos são "total**a**lunos". Mantido como está.

## Integridade

```
72f950a56a6346e9eb3ffc2c89fb2468  inscricoes/01_QueryA_InscricoesPorAno.csv.gz
5e75f23fa297e7bfa960cd21cfba9007  inscricoes/02_QueryB_RespostasSocioEconomicas.csv.gz
4f2c6a10ed98c8efd96e3a7d4449ff54  inscricoes/03_QueryC_PerguntasComDescricao.csv
a7e3c6361265e3f46b6a967b81fc0d55  inscricoes/04_UnidadesEscolaresComEndereco.csv
```

O `.gitattributes` desta pasta marca **todos** os arquivos de dados como binários, inclusive os `.csv`.
Isso é deliberado: os CSV usam **CRLF e BOM**, e uma conversão de fim de linha no checkout quebraria a
comparação de strings da última coluna (`situacao`).

## Começando

```python
import pandas as pd

# Lê o .gz direto, sem descompactar
a = pd.read_csv("data/inscricoes/01_QueryA_InscricoesPorAno.csv.gz",
                sep=";", encoding="utf-8-sig")

# A QueryD não tem cabeçalho
d = pd.read_csv("data/inscricoes/04_UnidadesEscolaresComEndereco.csv",
                sep=";", header=None, encoding="utf-8-sig", na_values=["NULL"],
                names=["seq","esc_codigo","nome","tipo","logradouro",
                       "numero","complemento","bairro","cep"])
```

```sql
-- DuckDB: lê o .gz do disco e só materializa o resultado
SELECT situacao, count(*) FROM read_csv_auto(
  'data/inscricoes/01_QueryA_InscricoesPorAno.csv.gz', delim=';'
) GROUP BY 1 ORDER BY 2 DESC;
```

A `02_QueryB` tem 4,36 milhões de linhas: **não abre no Excel** (teto de 1.048.576) e carregá-la inteira
custa vários GB de RAM. Use DuckDB, `chunksize` no pandas, ou `awk` direto no `.gz`.

Se descompactar os `.csv.gz` localmente, os `.csv` resultantes já estão no `.gitignore` da raiz.
