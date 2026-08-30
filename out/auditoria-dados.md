# Auditoria das bases da SME

Gerada em 2026-08-30 15:05 por `backend/app/etl/audit.py` em 8 s. Base anonimizada: **ordem de grandeza, não número oficial**.

**3 erros · 24 alertas · 17 informações.** Erro = quebra junção/regra; alerta = exige decisão (documentada na coluna Tratamento); info = característica a registrar.

## Resumo

| Métrica | Valor |
|---|---:|
| Opções (QueryA) | 837,179 |
| Inscrições | 343,308 |
| Crianças distintas | 259,924 |
| Crianças em mais de um processo | 34,486 |
| Unidades com inscrição | 872 |
| … com lat/long | 852 |
| … com polo/CRE | 871 |
| Respostas (QueryB) | 4,357,119 |
| Perguntas na régua (QueryC) | 65 |

## Achados

| Sev. | Área | Achado | Valor | Detalhe | Tratamento |
|---|---|---|---|---|---|
| **erro** | QueryD | Códigos de unidade duplicados na QueryD | 56 códigos | Exemplos: [('01001', 2), ('01002', 2), ('01005', 2), ('0101001', 2), ('0102004', 2)] | Na carga fica a linha com endereço preenchido (ou a 1ª); as demais vão para o log. |
| **erro** | arquivo | QueryD: arquivo SEM linha de cabeçalho | 408;NULL;EDI INFANTE DE SAGRES;3;NULL;NULL;NULL;NULL;NULL | Ler com header=True perde a primeira unidade e nomeia colunas com dados. | Lido com header=false e nomes explícitos (readers.QUERYD_COLS). |
| **erro** | localização | Planilhas .xlsx perderam o zero à esquerda dos códigos de unidade | junção crua 150/872 → normalizada 852 | QueryA usa '0734802'; a planilha traz 734802 (célula numérica). Junção literal casa só unidades sem zero. | Toda tabela ganha `codigo_norm = ltrim(codigo, '0')`; é a chave entre CSV e xlsx. Lat/long, CRE e polo vêm por ela. |
| **alerta** | QueryA | Crianças com mais de uma inscrição no mesmo processo | 38,765 | Pode ser reinscrição legítima (fluxo contínuo) ou colisão nome+nascimento sem CPF/DNV/NIS (gap reconhecido pela SME). | Cada inscrição é tratada como uma linha própria; a contagem por criança é aproximada. |
| **alerta** | QueryA | Inscrições criadas mais de um ano depois do processo | 4 linhas | 2021: 2021-01-05 → 2022-06-13; 2022: 2021-11-24 → 2023-08-11; 2023: 2022-12-01 → 2024-05-13; 2024: 2023-12-13 → 2026-05-26; 2025: 2024-12-10 → 2026-08-24 | O processo 2025 segue aberto (fluxo contínuo) — `data_criacao` chega a 2026. Não filtrar; só desempate usa a data. |
| **alerta** | QueryA | Mesma unidade/grupamento/turno repetida na mesma inscrição | 5 casos | A família escolheu a mesma unidade em duas ordens. | O motor ignora a repetição (mantém a 1ª ordem). |
| **alerta** | QueryA | `grupamento` com espaço à direita no arquivo | 'Maternal II ' | Agrupar sem strip() cria categorias duplicadas. | trim() no leitor. |
| **alerta** | QueryA | Idade fora de 0–47 meses em 31/03 do ano do processo | 31 linhas | 2021: <0m 6, >47m 0, s/ nasc. 0; 2022: <0m 10, >47m 0, s/ nasc. 0; 2023: <0m 15, >47m 0, s/ nasc. 0; 2024: <0m 0, >47m 0, s/ nasc. 0; 2025: <0m 0, >47m 0, s/ nasc. 0 | Anonimização generaliza o nascimento para ano-mês; não usar idade para excluir, só como informação. |
| **alerta** | QueryA | Opções com ordem > 5 | 11 linhas | A regra é até 5 opções; a 6ª aparece em pouquíssimas inscrições. | Carregar como está; o motor aceita listas de qualquer tamanho. |
| **alerta** | QueryA | `Cancelado na confirmacao` vem sem cedilha nem til | 118,816 linhas | Filtrar por 'Cancelado na confirmação' (com acento) devolve zero linhas. | Domínio canônico em readers.SITUACOES, exatamente como na base. |
| **alerta** | QueryB | `confirmado` deixa de discriminar Sim/Não a partir de 2022 | 2021: Sim 88.4% · Não 28.8%; 2022: Sim 10.6% · Não 6.6%; 2023: Sim 8.6% · Não 5.5%; 2024: Sim 8.5% · Não 7.3%; 2025: Sim 8.5% · Não 7.6% | Em 2021 quem respondeu Sim é confirmado ~3× mais; de 2022 em diante a taxa é igual — o campo virou ruído (validação passou a ser feita no RMI e não volta para a coluna). | A pontuação é calculada sobre `resposta`, não sobre `confirmado`. `confirmado` é carregado só para referência. |
| **alerta** | QueryD | Unidades sem código (coluna 1 = NULL) | 21 | A chave de junção com a QueryA é a coluna 1; sem ela a unidade não é referenciável. | Mantidas na carga com código sintético `SEQ-<seq>`; nunca casam com inscrições. |
| **alerta** | arquivo | QueryA: BOM UTF-8 no início | sim | Sem `utf-8-sig`/leitor que ignore BOM, a 1ª coluna vira `\ufeffano`. | DuckDB ignora o BOM; leitores pandas devem usar encoding='utf-8-sig'. |
| **alerta** | arquivo | QueryA: quebras de linha CRLF | sim | A última coluna recebe `\r` grudado em leitores ingênuos; comparações falham em silêncio. | DuckDB detecta; além disso todas as strings recebem trim(). |
| **alerta** | arquivo | QueryB: BOM UTF-8 no início | sim | Sem `utf-8-sig`/leitor que ignore BOM, a 1ª coluna vira `\ufeffano`. | DuckDB ignora o BOM; leitores pandas devem usar encoding='utf-8-sig'. |
| **alerta** | arquivo | QueryB: quebras de linha CRLF | sim | A última coluna recebe `\r` grudado em leitores ingênuos; comparações falham em silêncio. | DuckDB detecta; além disso todas as strings recebem trim(). |
| **alerta** | arquivo | QueryC: BOM UTF-8 no início | sim | Sem `utf-8-sig`/leitor que ignore BOM, a 1ª coluna vira `\ufeffano`. | DuckDB ignora o BOM; leitores pandas devem usar encoding='utf-8-sig'. |
| **alerta** | arquivo | QueryC: quebras de linha CRLF | sim | A última coluna recebe `\r` grudado em leitores ingênuos; comparações falham em silêncio. | DuckDB detecta; além disso todas as strings recebem trim(). |
| **alerta** | arquivo | QueryD: BOM UTF-8 no início | sim | Sem `utf-8-sig`/leitor que ignore BOM, a 1ª coluna vira `\ufeffano`. | DuckDB ignora o BOM; leitores pandas devem usar encoding='utf-8-sig'. |
| **alerta** | arquivo | QueryD: quebras de linha CRLF | sim | A última coluna recebe `\r` grudado em leitores ingênuos; comparações falham em silêncio. | DuckDB detecta; além disso todas as strings recebem trim(). |
| **alerta** | capacidade | Capacidade estimada (nº de Confirmado) por unidade/grupamento/turno | 2021: 1226 turmas-alvo, 29,166 vagas, mediana 22; 2022: 1275 turmas-alvo, 34,893 vagas, mediana 23; 2023: 1224 turmas-alvo, 28,329 vagas, mediana 20; 2024: 2129 turmas-alvo, 51,494 vagas, mediana 20; 2025: 2114 turmas-alvo, 48,688 vagas, mediana 18 | É um piso: vagas que ficaram vazias não aparecem. Otimizar sobre capacidade estimada é otimizar sobre número incerto. | Marcada como `estimada_confirmados`; a unidade pode informar o número real (fonte = informada). |
| **alerta** | junção | Respostas sem inscrição correspondente (QueryB → QueryA) | 221 |  | Descartadas na carga (FK). |
| **alerta** | junção | Inscrições sem nenhuma resposta ao questionário | 8,162 (2.4%) | Sem respostas a pontuação é 0 — a criança concorre só pelo desempate. | Carregadas com pontuacao = 0 e marcadas no painel. |
| **alerta** | junção | QueryA.unidade → planilha de localização (lat/long) | 852/872 unidades com coordenada |  | Sem coordenada a unidade aparece no painel sem mapa; distância não calculada. |
| **alerta** | localização | Unidades sem coordenada ou fora da caixa do município | sem coordenada 0 · fora do Rio 1 | Caixa usada: lat -23.1…-22.74, lon -43.8…-43.09 | Coordenada inválida vira NULL; a unidade continua existindo, só não entra em cálculo de distância. |
| **alerta** | nascidos vivos | Planilha traz linha 'Total' e bairros 'IGNORADO'/'EM BRANCO' | 2016: 82,854; 2017: 84,339; 2018: 82,484; 2019: 76,475; 2020: 72,406 … | Sem excluir a linha Total, toda soma dobra. 2026 é parcial. | Linha Total excluída no leitor; 'IGNORADO'/'EM BRANCO' mantidos e sinalizados. |
| **alerta** | ocupação | Layout das planilhas de ocupação muda por ano | 2021: 514 unid., 60,324 alunos; 2022: 510 unid., 56,690 alunos (sem turno); 2023: 498 unid., 51,174 alunos; 2024: 495 unid., 49,762 alunos; 2025: 488 unid., 46,975 alunos | 2021 usa TP/TU; 2022 não separa turno; 2023+ usa Integral/Parcial. Nomes de coluna e linhas de cabeçalho variam. | Leitor detecta a linha 'Aluno' e normaliza grupamento/turno; 2022 fica com horario NULL. |
| **info** | QueryA | Domínio de `grupamento` | 3 valores, todos esperados | Berçário=335,731, Maternal I=295,552, Maternal II=205,896 |  |
| **info** | QueryA | Domínio de `horario` | 2 valores, todos esperados | Integral=694,458, Parcial=142,721 |  |
| **info** | QueryA | Domínio de `situacao` | 8 valores, todos esperados | Cancelado pelo sistema=326,316, Confirmado=192,570, Lista de espera=178,731, Cancelado na confirmacao=118,816, Cancelado=18,722, Selecionado da lista=1,191, Ativo=606, Selecionado=227 |  |
| **info** | QueryA | Duplicatas de (inscrição, opcao) | 0 |  |  |
| **info** | QueryA | Linhas em estado transitório (Ativo/Selecionado/Selecionado da lista) | 2,024 | Estados de processos já encerrados; não servem de amostra para durações. | Excluídos de qualquer métrica de convocação. |
| **info** | QueryA | Inscrições com mais de uma opção `Confirmado` | 0 | Deveria ser no máximo uma; o excesso vem de reprocessamento ou de colisão de identidade. | Na estimativa de capacidade cada confirmação conta como vaga ocupada; para 'criança atendida' conta uma vez. |
| **info** | QueryA | CEP / bairro do responsável nulos | CEP 23,617 · bairro 23,725 (2.8%) |  | Sem endereço a distância não é calculável; a linha entra normalmente no motor. |
| **info** | QueryA | Mapeamento prm_id → ano | consistente | 179→2021 (198,498); 181→2022 (158,122); 184→2023 (123,174); 194→2024 (197,406); 195→2025 (159,979) |  |
| **info** | QueryB | Domínio de `confirmado` | Nao=3,815,454, Sim=541,665 |  | Convertido para boolean (Sim → true). |
| **info** | QueryB | Domínio de `resposta` | Nao=3,946,241, Sim=410,878 |  | Convertido para boolean (Sim → true). |
| **info** | QueryB | Duplicatas de (inscrição, pergunta) | 0 |  |  |
| **info** | QueryB | `pergunta_legenda` preenchida | 0 de 4,357,119 |  | Coluna descartada na carga. |
| **info** | QueryC | Régua por ano: perguntas · soma dos pesos · nº de desempates | 2021: 13 perg, Σ=465, 2 desemp.; 2022: 13 perg, Σ=465, 2 desemp.; 2023: 13 perg, Σ=465, 2 desemp.; 2024: 13 perg, Σ=100, 2 desemp.; 2025: 13 perg, Σ=100, 2 desemp. | A régua muda todo ano. A do dataset (até proc. 195/2025) NÃO é a da Res. 542/2025 (2026). | Tabela `pergunta` com chave (ano, ich_perg_id); o motor recebe a régua do ano. |
| **info** | QueryD | Unidades sem logradouro, bairro e CEP | 258 |  | Endereço vem então da planilha de localização (lat/long), quando existir. |
| **info** | junção | QueryA.unidade → QueryD.esc_codigo | 872/872 unidades casam |  | Chave = coluna 1 da QueryD (não a coluna 0). |
| **info** | junção | QueryA.unidade → planilhas de ocupação | 520/872 unidades | Ocupação ≠ oferta: a base não traz vagas ofertadas por processo. | Capacidade do motor é ESTIMADA pelo nº de Confirmado por unidade/grupamento/turno/ano (fonte = estimada_confirmados). |
| **info** | junção | QueryB → QueryC por (ano, ich_perg_id) | 0 respostas sem pergunta na régua do ano |  | Junção sempre por (ano, ich_perg_id); nunca por perg_id sozinho. |

## Métricas detalhadas

### Opções por ano

| Ano | Opções |
|---|---:|
| 2021 | 198,498 |
| 2022 | 158,122 |
| 2023 | 123,174 |
| 2024 | 197,406 |
| 2025 | 159,979 |

### Opções por inscrição

| Nº de opções | Inscrições |
|---|---:|
| 1 | 132,891 |
| 2 | 68,152 |
| 3 | 56,704 |
| 4 | 29,938 |
| 5 | 55,618 |
| 6 | 5 |

### `situacao`

| Situação | Linhas |
|---|---:|
| `Cancelado pelo sistema` | 326,316 |
| `Confirmado` | 192,570 |
| `Lista de espera` | 178,731 |
| `Cancelado na confirmacao` | 118,816 |
| `Cancelado` | 18,722 |
| `Selecionado da lista` | 1,191 |
| `Ativo` | 606 |
| `Selecionado` | 227 |

### Régua por ano (maior peso)

| Ano | perg_id | Pontos | Pergunta |
|---|---|---:|---|
| 2021 | 2 | 100 | A criança tem alguma deficiência? |
| 2021 | 3 | 100 | Possui Cartão Carioca? |
| 2021 | 11 | 100 | Faz parte do programa bolsa família? |
| 2021 | 21 | 100 | A criança pertence ao Programa Territórios Sociais? |
| 2022 | 2 | 100 | A criança tem alguma deficiência? |
| 2022 | 3 | 100 | Possui Cartão Carioca? |
| 2022 | 11 | 100 | Faz parte do programa bolsa família? |
| 2022 | 21 | 100 | A criança pertence ao Programa Territórios Sociais? |
| 2023 | 2 | 100 | A criança tem alguma deficiência? |
| 2023 | 3 | 100 | Possui Cartão Carioca? |
| 2023 | 11 | 100 | Faz parte do programa bolsa família? |
| 2023 | 21 | 100 | A criança pertence ao Programa Territórios Sociais? |
| 2024 | 2 | 25 | A criança tem alguma deficiência? |
| 2024 | 28 | 25 | Criança cuja família seja inscrita no CadÚnico (Cadastro Único para Pr |
| 2025 | 28 | 51 | Criança cuja família seja inscrita no CadÚnico (Cadastro Único para Pr |

### Capacidade estimada (Confirmado por unidade/grupamento/turno)

| Ano | Turmas-alvo | Vagas (soma) | mín | mediana | máx |
|---|---:|---:|---:|---:|---:|
| 2021 | 1,226 | 29,166 | 1 | 22 | 203 |
| 2022 | 1,275 | 34,893 | 1 | 23 | 205 |
| 2023 | 1,224 | 28,329 | 1 | 20 | 123 |
| 2024 | 2,129 | 51,494 | 1 | 20 | 163 |
| 2025 | 2,114 | 48,688 | 1 | 18 | 213 |

### `confirmado` — % confirmadas entre respostas Sim vs Não (perguntas com peso > 0)

| Ano | Sim | Não |
|---|---:|---:|
| 2021 | 88.4% | 28.8% |
| 2022 | 10.6% | 6.6% |
| 2023 | 8.6% | 5.5% |
| 2024 | 8.5% | 7.3% |
| 2025 | 8.5% | 7.6% |

### Ocupação (planilhas) por ano

| Ano | Unidades | Alunos | Linhas sem turno |
|---|---:|---:|---:|
| 2021 | 514 | 60,324 | 0 |
| 2022 | 510 | 56,690 | 1257 |
| 2023 | 498 | 51,174 | 0 |
| 2024 | 495 | 49,762 | 0 |
| 2025 | 488 | 46,975 | 0 |

### Nascidos vivos por ano (linha Total excluída)

| Ano | Nascidos | Bairros |
|---|---:|---:|
| 2016 | 82,854 | 169 |
| 2017 | 84,339 | 169 |
| 2018 | 82,484 | 169 |
| 2019 | 76,475 | 169 |
| 2020 | 72,406 | 169 |
| 2021 | 68,412 | 169 |
| 2022 | 64,636 | 169 |
| 2023 | 62,647 | 169 |
| 2024 | 57,443 | 169 |
| 2025 | 58,699 | 169 |
| 2026 | 33,346 | 169 |

### Unidades com inscrição por CRE

| CRE | Unidades |
|---|---:|
| 1 | 52 |
| 10 | 133 |
| 11 | 17 |
| 2 | 91 |
| 3 | 87 |
| 4 | 107 |
| 5 | 56 |
| 6 | 53 |
| 7 | 87 |
| 8 | 69 |
| 9 | 100 |
