# 09 — Achados dos dados

> Apurado sobre as bases de [`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche)
> (837.179 opções, 4.357.119 respostas, 2021–2025).
> **Lembrete da SME:** os dados são anonimizados e **indicadores absolutos não representam a realidade**.
> Tudo abaixo vale como **mecanismo e ordem de grandeza**, não como número oficial. Diga isso na banca —
> é o tipo de honestidade que o critério de Engenharia premia.

---

## 1. A família não usa as 5 opções — e está usando cada vez menos

Distribuição do número de opções por inscrição:

| Ano | 1 opção | 2 | 3 | 4 | 5 opções | média |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 29,3% | 21,3% | 18,6% | 10,7% | 20,1% | 2,71 |
| 2022 | 36,2% | 21,4% | 17,7% | 8,7% | 16,0% | 2,47 |
| 2023 | 38,3% | 21,6% | 17,0% | 8,0% | 15,1% | 2,40 |
| 2024 | 42,0% | 18,1% | 15,4% | 8,5% | 16,1% | 2,39 |
| 2025 | **47,0%** | 17,7% | 14,4% | 7,6% | 13,3% | **2,22** |

> **Quase metade das inscrições de 2025 indicou uma única creche.** O formulário permite cinco.

Por que importa: qualquer mecanismo de alocação — inclusive o Deferred Acceptance — só consegue casar
dentro da lista que a família declarou. Uma inscrição com 1 opção tem uma chance; com 5, tem cinco.
**Ajudar a família a preencher opções viáveis é a intervenção mais barata do case** e não exige
mudar norma nenhuma: a Res. SME 542/2025 já prevê até 5 opções.

E a conversão despenca com a ordem da opção — das 192.570 confirmações, **68% saem da 1ª opção**:

| Opção | Confirmadas | Lista de espera | Cancelado pelo sistema |
|---|---:|---:|---:|
| 1ª | 131.613 | 71.848 | 91.745 |
| 2ª | 33.797 | 44.802 | 94.773 |
| 3ª | 15.845 | 30.571 | 69.045 |
| 4ª | 7.152 | 18.947 | 42.916 |
| 5ª | 4.163 | 12.562 | 27.828 |

---

## 2. O maior vazamento: a vaga oferecida e não confirmada

`Cancelado na confirmacao` = a criança foi chamada, a vaga foi reservada, e a matrícula não se efetivou.
São **118.816 opções** (14,2% da base).

| Ano | crianças | obtiveram vaga | **passaram por cancelamento na confirmação e ficaram sem vaga** | ficaram só em lista de espera |
|---|---:|---:|---:|---:|
| 2021 | 57.690 | 50,5% | **17,8%** | 28,0% |
| 2022 | 57.820 | 60,2% | **20,8%** | 15,6% |
| 2023 | 45.918 | 61,4% | **18,4%** | 17,3% |
| 2024 | 71.757 | 71,0% | **10,1%** | 13,3% |
| 2025 | 62.899 | 77,4% | **9,5%** | 8,8% |

Agregado nos 5 anos: **126.845 crianças** tiveram ao menos uma opção cancelada na confirmação, e
**104.343 delas (82,3%) terminaram o processo sem vaga alguma**.

> Traduzindo: existe um grupo do tamanho de ~6 mil crianças por ano para quem **a vaga foi ofertada e
> mesmo assim a criança ficou de fora**. Não é escassez. É prazo, contato e navegação — exatamente o
> Eixo 3, e exatamente onde um agente de convocação rastreado tem ganho direto.

A taxa caiu de 17,8% para 9,5% entre 2021 e 2025, então **a SME já está melhorando isso** — o pitch
deve reconhecer o progresso e propor fechar o resto, não fingir que nada foi feito.

---

## 3. Escolher fora do bairro custa quase metade da chance

Cruzando o bairro do responsável (QueryA) com o bairro da unidade (QueryD):

| Relação territorial | Opções | % do total | Taxa de confirmação |
|---|---:|---:|---:|
| Mesmo bairro | 409.533 | 48,9% | **27,1%** |
| Bairro diferente | 397.422 | **47,5%** | **18,8%** |
| Sem bairro informado | 30.224 | 3,6% | 21,9% |

Por ano, o padrão é estável e a diferença nunca fecha:

| Ano | % fora do bairro | conf. mesmo bairro | conf. fora do bairro |
|---|---:|---:|---:|
| 2021 | 56,5% | 19,8% | 10,8% |
| 2022 | 48,1% | 25,7% | 18,2% |
| 2023 | 48,1% | 26,8% | 19,1% |
| 2024 | 46,0% | 29,1% | 22,6% |
| 2025 | 46,2% | 33,9% | 27,2% |

> **Quase metade das escolhas aponta para fora do bairro de casa, e essas escolhas convertem ~1,4× menos.**
> Isso mede exatamente o que a SME descreveu: "escolha livre por unidades, sem critério territorial, gera
> filas que não refletem falta de vaga, mas cancelamentos e desistências por distância".

Ressalva honesta: bairro é uma régua grosseira — um bairro vizinho pode ser mais perto que o outro lado do
mesmo bairro. O efeito real da distância é **provavelmente maior** que o medido. Com `LATITUDE`/`LONGITUDE`
das unidades ([03](03-dados-disponiveis.md#2-oferecimento-e-vagas-oferecimentosevagas)) dá para refazer
isso por distância de verdade — do lado da unidade, com o CEP como âncora do lado da família.

---

## 4. A comprovação de critérios praticamente não é registrada

Cruzando QueryB (`resposta`, `confirmado`) com QueryC (`perg_pontuacao`):

| Ano | inscrições que declararam algum critério pontuado | destas, tiveram algum critério **não confirmado** | pontos declarados → confirmados |
|---|---:|---:|---:|
| 2021 | 39,9% | 12,0% | **88,1%** retidos |
| 2022 | 36,4% | 91,8% | 9,5% |
| 2023 | 53,6% | 93,3% | 7,2% |
| 2024 | 68,5% | 92,7% | 8,2% |
| 2025 | 68,3% | 92,4% | 7,2% |

Exemplos de 2025: **CadÚnico (51 pts) — 35.141 declarações "Sim", 2.390 confirmadas (6,8%)**;
educação especial (25 pts) — 1.664 declarações, 221 confirmadas (13,3%).

### Isto é perda real de pontuação ou falha de registro?

**Não dá para afirmar com os dados, e essa ambiguidade é o achado.** O teste que separa as hipóteses:

| Ano | resposta = `Sim`, % confirmada | resposta = `Nao`, % confirmada |
|---|---:|---:|
| 2021 | **88,9%** | 29,6% |
| 2022 | 10,8% | 7,8% |
| 2023 | 8,7% | 6,9% |
| 2024 | 7,9% | 7,3% |
| 2025 | 8,0% | 7,6% |

Em 2021 o campo **discrimina** (quem respondeu Sim é confirmado 3× mais). De 2022 em diante a taxa é
a mesma para `Sim` e para `Nao` — o campo virou ruído. E só **10,1%** das inscrições de 2025 têm
*qualquer* confirmação registrada.

A explicação mais provável está no próprio briefing: a partir de 2024 a validação de CadÚnico e Bolsa
Família passou a ser feita **por cruzamento no data lake via Registro Municipal Integrado** — e esse
resultado aparentemente **não volta** para a coluna `confirmado`.

O desfecho de 2025 é compatível com as duas leituras:

| Grupo (2025) | crianças | obtiveram vaga |
|---|---:|---:|
| Declarou CadÚnico e **foi confirmado** | 2.215 | **82,3%** |
| Declarou CadÚnico e **não foi confirmado** | 28.509 | 77,0% |
| Declarou `Nao` | 32.460 | 76,7% |

Quem declarou e não teve confirmação obteve vaga na **mesma taxa** de quem não declarou nada — 51 pontos
que não valeram nada, exatamente o que o **Art. 7º** da Res. 542/2025 manda acontecer. Só a confirmação
efetiva rendeu vantagem (+5,6 p.p.).

> **É a pergunta nº 1 para a SME na abertura.** Se for perda real, é o maior problema do case inteiro e
> ninguém sabe disso. Se for falha de registro, o projeto que tenta "medir a perda de comprovação" está
> otimizando cima de um artefato — e o time que percebeu isso ganha credibilidade instantânea.
>
> Vale notar que o documento de parametrização da SME já aponta para lá: *"substituir a comprovação
> manual de critérios por validação automática via cruzamento de dados oficiais, reduzindo perda indevida
> de pontuação."* **A SME já disse qual solução ela quer.**

---

## 5. A régua mudou duas vezes

| Ano | Topo da régua |
|---|---|
| 2021–2023 | **100 pts** cada: deficiência da criança · Bolsa Família · Cartão Carioca · Territórios Sociais · **10 pts**: refugiado, responsável 60+, responsável com deficiência, doença crônica, violência doméstica, drogas/álcool · **5 pts**: familiar presidiário |
| 2024 | **25**: deficiência da criança, **CadÚnico** · **15**: Bolsa Família ou Cartão Carioca · **10**: drogas/álcool, violência doméstica · **5**: refugiado · **3**: doença crônica · **2**: presidiário, monoparental, responsável com deficiência · **1**: esteve na fila no ano anterior |
| 2025 | **51**: **CadÚnico** · **25**: público-alvo da educação especial · **4**: violência doméstica, monoparental · **3**: doença crônica, responsável com deficiência · **2**: presidiário, drogas/álcool, refugiado, fila do ano anterior, Bolsa Família/Cartão Carioca |

Das 13 perguntas de 2023, **só 3 sobreviveram em 2024**. A pergunta sobre deficiência (`perg_id = 2`)
valia 100 e passou a valer 25.

> ⚠️ **A régua de 2025 no dataset não é a da Res. SME 542/2025.** O dataset vai até o processo 195 (2025);
> a Res. 542 é de **18/11/2025** e rege o processo de **2026**, que não está na base. As tabelas diferem
> (ex.: educação especial vale **25** no processo 195 e **15** na Res. 542). Simulação histórica usa a
> régua do ano; proposta para o futuro usa a Res. 542. Confundir as duas é erro de banca.

Desempate em 2024–2025 (`perg_pontuacao = 0`, `perg_criterio = Sim`): irmão matriculado na rede pública ou
parceira → responsável menor de 18 anos.

---

## 6. A coorte está encolhendo — e não de forma uniforme

Nascidos vivos no município (`NascidosvivosRJ.xlsx`, por bairro de residência da mãe):

| 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 82.854 | 84.339 | 82.484 | 76.475 | 72.406 | 68.412 | 64.446 | 62.636 | 57.427 | 58.696 |

**−29% em oito anos.** Coorte 0–3 relevante para 2026 (nascidos em 2023+2024+2025): **≈ 178,8 mil crianças**.
Contra ~89 mil matriculadas em creche, a cobertura é da ordem de **50%** — e a fila declarada (~10–13 mil)
não explica a diferença. **Sobram ~77 mil crianças 0–3 que não estão matriculadas nem na fila.**
É a demanda reprimida não manifesta, agora calculável com dado real.

E os territórios andam em direções opostas:

| Bairro | 2016 | 2025 | variação |
|---|---:|---:|---:|
| Campo Grande | 5.048 | 3.501 | **−31%** |
| Bangu | 3.404 | 1.975 | **−42%** |
| Realengo | 2.241 | 1.451 | −35% |
| Santa Cruz | 3.676 | 3.186 | −13% |
| Complexo da Maré | 1.275 | 1.492 | **+17%** |
| Recreio dos Bandeirantes | 1.299 | 1.259 | −3% |

> **O Eixo 1 não é só "abrir mais vagas" — é realocar.** Planejar pela fila do ano anterior não enxerga
> nem a queda de 42% em Bangu nem a alta de 17% na Maré. Um mapa de coorte × capacidade instalada por
> microárea responde "onde abrir **e onde reduzir**", e isso é uma conversa que nenhum outro time
> provavelmente vai ter.

---

## 7. O que os dados **não** permitem

Registre isso no pitch antes que a banca pergunte:

- **Não há histórico de mudança de status.** A única data da base é `data_criacao` da inscrição. É
  impossível medir quanto tempo uma opção ficou em `Selecionado`, qual a duração real da convocação ou a
  profundidade da cascata. *Este é o gap nº 1 declarado pela própria SME* — e a implicação de produto é
  direta: **a primeira coisa que a solução precisa fazer é carimbar a hora de cada transição.**
- **Não há vagas ofertadas por unidade/turma no processo.** Há ocupação (`totalalunoscreche*.xlsx`,
  atualização dinâmica) e há confirmações na QueryA — capacidade tem que ser **estimada**, e o número é
  incerto. Otimizar alocação sobre capacidade estimada é otimizar com precisão sobre número errado.
- **Não há endereço da família**, só bairro e CEP. Distância real só dá para calcular do lado da unidade.
- **Não há telefone, e-mail ou qualquer canal de contato** — a hipótese "contatos desatualizados" não é
  verificável aqui, só na fala da SME.
- **Contagem por criança tem erro conhecido** quando falta CPF/DNV/NIS (colisão nome + nascimento).
- **`Selecionado` e `Ativo` quase não existem na base** (227 e 606 linhas) porque são estados
  transitórios de processos já encerrados. Não sirvam de amostra para nada.

---

## 8. Recorte recomendado à luz dos dados

Ordenado por impacto demonstrável em um dia:

1. **Assistente de escolha das 5 opções** — ataca o achado nº 1 (47% usam uma só) e o nº 3 (metade escolhe
   fora do bairro, com 1,4× menos chance). Insumo pronto: lat/long das unidades, microáreas, histórico de
   conversão por unidade. Métrica de demo: *"esta inscrição tinha 1 opção e 23% de chance; com 4 opções
   viáveis no raio, 68%"*.
2. **Convocação rastreada** — ataca o achado nº 2 (~6 mil crianças/ano perdem a vaga já ofertada) e o
   gap nº 1 da SME. Começa por carimbar transições, que é o dado que hoje não existe.
3. **Validação automática de critérios via RMI** — é a solução que a **própria SME escreveu** que quer, e
   o achado nº 4 mostra que hoje o registro de comprovação é cego.
4. **Mapa coorte × capacidade por microárea** — ataca o achado nº 6, com o argumento de realocação que
   ninguém mais vai trazer.

Os quatro compartilham o mesmo núcleo: **um motor de matching determinístico** que consome preferência da
família + pontuação da resolução e devolve alocação estável e auditável ([04](04-analise-tecnica.md)).
