# 01 — Contexto e legislação

## 1. Escala da rede

Dados dos cinco processos seletivos mais recentes (2021–2025), segundo a SME:

| Métrica | Valor |
|---|---|
| Opções de creche escolhidas | **837.179** |
| Inscrições | **~343 mil** |
| Crianças distintas | **~260 mil** |
| Unidades escolares na rede de creche | **872** (855 diretas, 10 conveniadas, 7 em parceria) |
| Inscrições em um único processo | pode passar de **45 mil** |
| Turnos | Integral (**83%** das opções escolhidas) e Parcial |
| Grupamentos etários | Berçário, Maternal I, Maternal II |
| Coordenadorias Regionais de Educação (CREs) | **11** |

O deck da SME cita ainda **482 unidades públicas + 372 parceiras** e **+89 mil crianças matriculadas**
na educação infantil, modalidade creche.

## 2. Como funciona hoje a inscrição

### Fluxo (ciclo 2026, referência)

1. **Inscrição online** — 09 a 12/12/2025, em `matricula.rio` (24h, inclusive fim de semana) ou pelo app
   **Rioeduca em Casa**. Sem internet: ir à unidade escolar mais próxima. CPF obrigatório, com validação
   na Receita Federal.
2. O responsável escolhe **até 5 opções** de unidades (municipais e/ou parceiras), por ordem de preferência,
   e responde ao **questionário socioeconômico**.
3. **Comprovação presencial de prioridades** — 11 a 17/12/2025, na unidade/data indicada no comprovante.
   Parte dos critérios (CadÚnico, Bolsa Família) é validada por cruzamento via **Registro Municipal Integrado**.
4. **Classificação pública** — 13/01/2026 (data publicada no Diário Oficial). **Resultado** — 21/01/2026.
5. **Confirmação presencial da matrícula** — 22 a 29/01/2026.
6. Quem não consegue vaga entra em **lista de espera**, com períodos de 3 dias para convocação.

### Regra de ouro

> **Não é sorteio nem ordem de chegada. É classificação por pontuação.**
> (Resolução SME nº 542, de 18/11/2025)

### Etapas de retaguarda (SME + 11 CREs)

| Momento | O que acontece | Ferramenta |
|---|---|---|
| Inscrição | Responsável escolhe até 5 opções por ordem de preferência | `matricula.rio` / app Rioeduca em Casa |
| Avaliação socioeconômica | Questionário de vulnerabilidade (violência, drogas, CadÚnico, deficiência…) | Formulário + Polo de Avaliação (creche) |
| Classificação | Sistema soma a pontuação e ordena a fila por **unidade e turno** | Sistema interno de inscrição (**ICH**) |
| Chamada de vaga | Próximo da fila é chamado; opção vira "Selecionado" | Sistema interno + contato com a família |
| Confirmação | Responsável confirma a matrícula na unidade dentro do prazo | Unidade escolar / sistema interno |
| Fechamento das demais opções | Demais opções do cadastro são canceladas ou expiram | Rotina automática do sistema interno |

### Sistemas envolvidos no fluxo

1. **Planejamento de Matrícula** — organiza a rede entre o ano atual e o seguinte.
2. **Site de Matrícula** — recebe as vagas que serão ofertadas no processo.
3. **Inscrição Creche** — inscrições do site são exportadas para classificação e convocação; antes da
   classificação, os critérios são confirmados via **Registro Municipal Integrado**, usando o *data lake*.
4. **Classificação** — em data publicada no DO, o sistema executa o script de classificação, gerando lista
   de classificados e de espera por unidade.

> Registro Municipal Integrado (RMI): https://docs.dados.rio/rmi/overview

## 3. Critérios de classificação

### Tabela vigente — Res. SME 542/2025, Art. 6º §4º

| Critério | Pontos |
|---|---|
| Família inscrita no **CadÚnico** | **51** |
| Aluno de Educação Especial | 15 |
| Beneficiário do Programa Pequenos Cariocas | 5 |
| Beneficiário do Bolsa Família | 5 |
| Criança/família vítima de violência doméstica | 5 |
| Família monoparental | 5 |
| Pais/responsáveis com deficiência | 3 |
| Familiar com doença crônica grave | 3 |
| Dependência química/alcoolismo na família | 2 |
| Familiar privado de liberdade | 2 |
| Criança refugiada | 2 |
| Esteve na lista de espera 2025 sem ser atendida | 2 |

**Desempate (Art. 6º §8º), nesta ordem:** 1) irmão matriculado na rede pública ou parceira;
2) pais/responsáveis menores de 18 anos; 3) ordenação eletrônica pelo sistema.

**Documentação:** certidão de nascimento, CPF da criança, CPF dos pais/responsável, carteira de vacinação,
comprovante de endereço, identificação do responsável, declaração escolar (se já estudou), NIS (se houver).

### ⚠️ A régua muda a cada ano — atenção ao analisar a base 2021–2025

| Período | Lógica de pontuação |
|---|---|
| 2021–2023 | Cartão Família Carioca / Bolsa Família / deficiência da criança / Territórios Sociais = **100 pts**; vulnerabilidades intermediárias (violência doméstica, drogas/álcool, déficit nutricional ou doença crônica, refugiado, responsável 60+ ou com deficiência) = **10 pts**; familiar presidiário ou ex-presidiário (últimos 5 anos) = **5 pts** |
| 2024 | SME revisa a fórmula: **CadÚnico** passa a ter o maior peso; Bolsa Família / Cartão Carioca caem drasticamente |
| 2025 | **CadÚnico isoladamente o maior peso (51)**; público-alvo da educação especial = **25** |

> Comparar a posição de uma criança entre dois anos exige olhar a tabela de pesos **daquele ano**
> (dataset "Perguntas por processo"), nunca uma tabela única.

> ⚠️ **A tabela acima (Res. 542/2025) rege o processo de 2026 e não está no dataset.** A base vai até o
> processo 195 (2025), cuja régua é parecida mas **não igual** — educação especial vale 25 lá e 15 aqui,
> e a Res. 542 traz o Programa Pequenos Cariocas, que não aparece na base. As réguas ano a ano efetivamente
> praticadas estão em [09](09-achados-dos-dados.md#5-a-régua-mudou-duas-vezes).

### O ponto de falha mais explorável

> **"Caso os critérios classificatórios não sejam comprovados, deixarão de ser computadas as respectivas
> pontuações."** (Art. 7º)

A família que **tem** direito à pontuação mas não comparece na data certa, com o documento certo, no lugar
certo, **perde os pontos**. Numa disputa onde CadÚnico vale 51 de ~100 pontos, perder a comprovação é perder
a vaga. É um problema de **informação, prazo e navegação burocrática** — não de escassez.

### Sem georreferenciamento na norma

A resolução **não** traz regra de proximidade ou geolocalização: o responsável escolhe 5 unidades por
preferência, sem qualquer feedback territorial. Famílias escolhem no escuro. Espaço claro para *matching*
e recomendação informada.

## 4. A dor: números e pressão

- **~10 mil crianças** na fila por vaga em creche municipal (dado da própria Prefeitura à época da decisão
  judicial). Denúncia do SEPE fala em **13 mil** fora das creches.
- **Ação judicial de 2003** (MP-RJ; Defensoria como assistente desde 2021). Em **27/09/2024**, a 2ª Câmara
  de Direito Público **negou recurso da Prefeitura** e manteve a ordem de **zerar a fila em 90 dias**.
- Prefeitura já foi **multada em mais de R$ 2 bilhões** por omissão prolongada, com multa diária por criança
  não atendida.
- Argumento da Defensoria: a meta do PNE (50% de atendimento até 2024) não autoriza deixar metade das
  crianças sem acesso; educação infantil é prioridade absoluta.
- Brasil todo: **+632 mil crianças** em fila de espera por creche.
- Promessas da gestão: 13 mil novas vagas anunciadas; +8 mil vagas em creche em um ano.

### Dores qualitativas documentadas (Rocinha, Rio das Pedras)

- **Fila sem previsão:** "a fila de espera era muito grande, não tinha uma data certa de espera". Zero
  visibilidade de posição ou prazo.
- **Déficit territorial:** Rio das Pedras tem 8 estabelecimentos (6 municipais); Rocinha tem 21 unidades,
  mas só 6 públicas.
- **Incompatibilidade de horário:** creche até 15h vs. jornada até 19h30 → mãe solo pagando R$ 250/mês de
  transporte particular.
- **Custo de oportunidade:** falta de vaga tira mães do mercado de trabalho.
- **Criança atípica:** falta de monitores previstos em lei, acompanhamento genérico.

## 5. Ecossistema tecnológico da Prefeitura

| Sistema | Papel |
|---|---|
| **matricula.rio** | Inscrição online e consulta de resultado (`/ConsultaCreche`) |
| **Carioca Digital** (`carioca.rio`) | Portal unificado de serviços ao cidadão |
| **1746** (`1746.rio`, tel. 1746) | Canal central de atendimento, informação e reclamação |
| **App Rioeduca em Casa** | Canal mobile da SME |
| **Registro Municipal Integrado (RMI)** | Cruzamento de bases municipais; valida CadÚnico e Bolsa Família |
| **data.rio** | Portal de dados abertos (ex.: dataset "Escolas Municipais") |
| **IplanRio** | Empresa municipal de informática — dona da infra e da inovação digital |
| **Rio.IA** | Hub carioca de IA (SMCT), com edital para startups de IA |
| **IPP** (Instituto Pereira Passos) | Organização territorial (microáreas SME) |

### Precedente muito relevante: o agente **"Pref Rio"**

Agente de IA da IplanRio, lançado no Web Summit Rio, que **conversa por WhatsApp** com cidadãos vulneráveis,
cruza bases de várias secretarias e faz **busca ativa proativa**.

- Foco inicial: ~135 mil pessoas vulneráveis, com prioridade em **gestantes e crianças de até 6 anos**.
- Objetivos: cobertura vacinal, frequência escolar, transferência de renda (Bolsa Família).
- Resultados relatados: +10% de frequência escolar entre alunos de baixa renda; 25% dos evadidos retornaram;
  +7 p.p. em renovações do Bolsa Família.
- **Venceu o Bloomberg Philanthropies Mayors Challenge 2025-2026** (US$ 1 milhão).

**Implicação para o pitch:** a Prefeitura **já acredita** em agente conversacional no WhatsApp + cruzamento
de bases + busca ativa, e já tem prova de resultado. Uma solução posicionada como **extensão do Pref Rio para
o funil da creche** tem caminho de adoção muito mais curto — e um pitch que ignore o Pref Rio parece
desinformado. Há também um **guia de uso ético de IA no serviço público** criado pela Prefeitura e um acordo
de governança digital entre o Conselho Municipal de Proteção de Dados e a SMCT.

**Alerta de reputação:** a Prefeitura já lançou um "modelo de IA próprio" que sofreu críticas técnicas duras
e admitiu erro publicamente. Times que prometem mais do que entregam tocam numa ferida recente.
**Sobriedade técnica vende aqui.**
