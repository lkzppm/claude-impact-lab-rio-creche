# 02 — O case oficial: três eixos

> Enunciado pela SME-Rio. Íntegra em [`fontes/Briefing_SME.md`](fontes/Briefing_SME.md) e no deck
> "Match Perfeito: Inteligência na Inscrição de Creche" ([`fontes/Apresentacao_SME.pdf`](fontes/Apresentacao_SME.pdf)).

Por trás da inscrição existem três fases de retaguarda geridas pela SME e pelas 11 CREs —
**Planejamento**, **Classificação** e **Convocação**. É nelas que o desafio se concentra.

---

## Eixo 1 — Planejamento

> **Pergunta da SME:** como qualificar o planejamento e atender a demanda de uma metrópole com
> territórios tão distintos?

Hoje a definição de vagas por unidade parte, em boa parte:

- da **fila do ano anterior** como "demanda manifesta";
- da análise de **nascidos vivos** (IBGE);
- do **histórico de matriculados** da rede.

Estrutura de decisão:

| Ator | Papel |
|---|---|
| **Nível Central** | Estabelece as métricas e subsidia com os dados necessários para o planejamento do ano seguinte |
| **11 CREs** | Administram a matrícula em seu território |
| **872 unidades escolares** | Indicam demandas pontuais na comunidade escolar, com base na realidade local |

> Pergunta em aberto do deck: *"que outras variáveis precisamos incorporar para que esse olhar, antes
> retrospectivo, comece a antecipar o comportamento futuro da demanda?"*

---

## Eixo 2 — Inscrição e Classificação

> **Pergunta da SME:** a lógica de classificação de hoje precisa ser reavaliada. É possível mudar a lógica
> para otimizar o preenchimento das vagas? Qual seria a melhor forma de reorganizar o processo, garantindo
> agilidade e evitando gargalos, sem comprometer o fluxo contínuo de matrículas?

**Estado atual:** o sistema classifica **5 crianças por escolha**, com **3 dias** de convocação e confirmação
para cada uma. A inscrição é feita por ordem de até 5 opções.

### Fluxo, passo a passo (deck, Eixo 2)

1. Família se inscreve e escolhe até 5 unidades + declara os critérios no site (`matricula.rio`).
2. Leva a documentação a uma das unidades escolhidas para comprovar parte dos critérios.
3. A creche confirma manualmente no sistema; a SME confirma CadÚnico e Bolsa Família.
4. Pontuação é registrada; a classificação é realizada e as vagas são priorizadas e distribuídas.
5. O ano inicia com **vagas ociosas + convocação manual + contatos desatualizados = convocação demorada**.

### Onde o fluxo quebra (palavras da SME)

- A escolha das 5 unidades é feita **sem qualquer critério de distância ou território** → opções inviáveis
  e, consequentemente, cancelamentos futuros.
- A classificação é orientada pelo **total de escolhas por unidade, e não por CPF** → lacunas e pontos cegos
  na convocação.
- O sistema classifica as opções **simultaneamente**: ofertando **até 5 vagas para o mesmo CPF**.

---

## Eixo 3 — Convocação

> **Pergunta da SME:** mais agilidade — dá para automatizar esse fluxo?

Linha do tempo quando surge uma vaga:

| Etapa | Regra |
|---|---|
| **Contato da escola** | No mínimo 1 tentativa por dia, durante **3 dias consecutivos**, em horários diferentes, por telefone, e-mail, WhatsApp ou SMS |
| **Prazo da família** | **3 dias úteis** para comparecer e confirmar a vaga na unidade |
| **Possível extensão** | Mais 1 dia útil, mediante justificativa apresentada dentro do prazo original |

Não localizar a família ou não obter resposta a tempo **retira a criança da lista** e passa a vaga adiante.
É um fluxo **inteiramente manual e repetitivo**, tentativa a tentativa, com potencial claro de automação e
rastreio.

---

## Problema central declarado

> A equipe da CRE/polo acompanha **milhares de inscrições por processo sem um painel** que sinalize, por
> unidade e por criança, há quanto tempo uma vaga está "Selecionada" aguardando confirmação, ou que aponte
> inconsistências entre as opções de um mesmo cadastro. Hoje isso só aparece com checagem manual, linha a linha.

## Gaps do processo atual (tabela da SME)

| Gap identificado | Impacto prático |
|---|---|
| **Fila sem visibilidade de prazo** | Não há registro de quando uma opção mudou de status; famílias e equipe não sabem há quanto tempo uma vaga "Selecionada" aguarda confirmação |
| **Estados transitórios não sinalizados** | Em ~**0,2%** das inscrições, uma opção aparece "Selecionada" enquanto outra do mesmo cadastro segue em "Lista de espera" — sem painel, a equipe não identifica a tempo |
| **Identificação da criança sujeita a colisão** | Sem CPF, DNV ou NIS, o sistema agrupa por nome + data de nascimento; em parte dos casos multi-inscrição isso mistura crianças diferentes sob o mesmo código, distorcendo a contagem de fila |
| **Critérios de pontuação mudam a cada processo** | Pesos revisados em 2024 e de novo em 2025 → difícil explicar às famílias por que sua posição mudou de um ano para outro |
| **Fila histórica represada** | Há vagas ociosas em pontos da rede e, ao mesmo tempo, listas de espera expressivas. A fila reflete menos escassez global e mais **descompasso entre oferta e demanda por território e turno** — em grande parte uma **fila de preferência**, não de ausência de vaga |
