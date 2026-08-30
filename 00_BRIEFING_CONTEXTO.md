# Briefing de Contexto — Claude Impact Lab Rio #2
## Tema: IA na inscrição/matrícula em creche na Prefeitura do Rio

> Documento de contexto levantado por pesquisa web em 30/08/2026, **antes** do case oficial ser apresentado pela SME.
> Objetivo: servir de base para todas as sessões futuras do Claude neste projeto.
> ⚠️ Tudo aqui é pesquisa aberta. Quando a SME entregar o case + dados reais, **o case manda** — atualize este arquivo.

---

## 1. O evento

| Item | Detalhe |
|---|---|
| Nome | Claude Impact Lab — 2ª edição brasileira |
| Data | Domingo, 30/08/2026 (1 dia) |
| Local | Escritório da VTEX, Praia de Botafogo, Rio |
| Tema | IA para desafios reais da **educação municipal** |
| Quem propõe o problema | **Secretaria Municipal de Educação (SME-Rio)** — apresenta "o problema, os dados e as informações" no início do dia |
| Organização | João Lisboa (cofundador da Taicor, Claude Community Ambassador BR), patrocínio da **Anthropic** |
| Apoio institucional | Prefeitura do Rio via Secretaria Municipal de Desenvolvimento Econômico (SMDE) |
| Formato | ~100 participantes, times de até 4 pessoas multidisciplinares; sem exigência de experiência prévia em IA |
| Avaliação | Banca com autoridades municipais + lideranças de IA; **critérios definidos pela SME** |
| Prêmio | Créditos Claude/Anthropic; **o projeto vencedor é doado à cidade** ("impacto imediato") |
| Precedente | 1ª edição: 24/05/2026, Porto Maravalley, tema Saúde e Segurança Pública |

**Leitura estratégica:** "o vencedor é doado à cidade" muda o que a banca premia. Não é o protótipo mais impressionante — é o que a SME consegue **operar de verdade**: integra com sistemas que já existem, respeita a resolução vigente, não cria passivo jurídico e não depende de dado que a prefeitura não tem.

---

## 2. Como funciona HOJE a inscrição em creche no Rio

### Fluxo (ciclo 2026, referência)
1. **Inscrição online** — 09 a 12/12/2025, exclusivamente em `matricula.rio` (24h, inclusive fim de semana). Também via app **Rioeduca**. Sem internet: ir à unidade escolar mais próxima.
2. O responsável escolhe **até 5 opções** de unidades (municipais e/ou parceiras), por ordem de preferência.
3. **Comprovação presencial de prioridades** — 11 a 17/12/2025, na unidade/data indicada no comprovante de inscrição.
4. **Classificação pública** — 13/01/2026. **Resultado** — 21/01/2026.
5. **Confirmação presencial da matrícula** — 22 a 29/01/2026.
6. Quem não consegue vaga entra em **lista de espera** (historicamente registrada na própria unidade).

### Regra de ouro
> **Não é sorteio nem ordem de chegada. É classificação por pontuação.** (Resolução SME nº 542, de 18/11/2025)

### Tabela de pontuação (Res. SME 542/2025, Art. 6º §4º)

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

**Desempate (Art. 6º §8º), nesta ordem:** 1) irmão matriculado na rede pública ou parceira; 2) pais/responsáveis menores de 18 anos; 3) ordenação eletrônica pelo sistema.

**Documentação:** certidão de nascimento, CPF da criança, CPF dos pais/responsável, carteira de vacinação, comprovante de endereço, identificação do responsável, declaração escolar (se já estudou), NIS (se houver).

### ⚠️ O ponto de falha mais explorável do processo
> **"Caso os critérios classificatórios não sejam comprovados, deixarão de ser computadas as respectivas pontuações."** (Art. 7º)

Ou seja: a família que **tem** direito à pontuação mas não comparece na data certa, com o documento certo, no lugar certo — **perde os pontos**. Numa disputa onde CadÚnico vale 51 de ~100 pontos possíveis, perder a comprovação é perder a vaga. Isso é um problema de **informação, prazo e navegação burocrática**, não de escassez — e é exatamente o tipo de problema onde um agente de IA tem vantagem real.

### Sem georreferenciamento explícito
A resolução **não** traz regra de proximidade/geolocalização — o responsável escolhe 5 unidades por preferência. Isso é uma lacuna: famílias escolhem no escuro, sem saber onde há chance real de vaga. Espaço claro para "matching" e recomendação informada.

---

## 3. A dor: números e pressão

- **~10 mil crianças** na fila por vaga em creche municipal (dado da própria prefeitura, à época da decisão judicial). Denúncia do SEPE fala em **13 mil** fora das creches.
- **Ação judicial de 2003** (MP-RJ; Defensoria entra como assistente em 2021). Em **27/09/2024**, a 2ª Câmara de Direito Público **negou recurso da Prefeitura** e manteve a ordem de **zerar a fila em 90 dias**.
- Prefeitura já foi **multada em mais de R$ 2 bilhões** por omissão prolongada, com multa diária por criança não atendida.
- Argumento da Defensoria: a meta do PNE (50% de atendimento até 2024) não autoriza deixar metade das crianças sem acesso; educação infantil é prioridade absoluta.
- Brasil todo: **+632 mil crianças** em fila de espera por creche.
- Promessas da gestão: 13 mil novas vagas anunciadas; +8 mil vagas em creche em um ano.

### Dores qualitativas documentadas (favelas — Rocinha, Rio das Pedras)
- **Fila sem previsão:** "a fila de espera era muito grande, não tinha uma data certa de espera". Zero visibilidade de posição ou prazo.
- **Déficit territorial:** Rio das Pedras tem 8 estabelecimentos (6 municipais); Rocinha tem 21 unidades, mas só 6 públicas.
- **Incompatibilidade de horário:** creche até 15h vs. jornada até 19h30 → mãe solo pagando R$250/mês de transporte particular.
- **Custo de oportunidade:** falta de vaga tira mães do mercado de trabalho.
- **Criança atípica:** falta de monitores previstos em lei, acompanhamento genérico.

---

## 4. Ecossistema tecnológico da Prefeitura (com o que a solução vai ter que conversar)

| Sistema | Papel |
|---|---|
| **matricula.rio** | Inscrição online e consulta de resultado (`/ConsultaCreche`: busca por nº de inscrição + data de nascimento, ou nome + nascimento + filiação) |
| **Carioca Digital** (`carioca.rio`) | Portal unificado de serviços ao cidadão |
| **1746** (`1746.rio`, tel. 1746 / 21 3460-1746) | Canal central de atendimento, informação e reclamação |
| **App Rioeduca** | Canal mobile da SME |
| **data.rio** | Portal de dados abertos (ex.: dataset "Escolas Municipais") |
| **IplanRio** | Empresa municipal de informática — dona da infra e da inovação digital |
| **Rio.IA** | Hub carioca de IA (SMCT), com edital para startups de IA |

### Precedente MUITO relevante: o agente **"Pref Rio"**
Agente de IA da IplanRio, lançado no Web Summit Rio, que **conversa por WhatsApp** com cidadãos vulneráveis, cruza bases de várias secretarias e faz **busca ativa proativa**.
- Foco inicial: ~135 mil pessoas vulneráveis, com prioridade em **gestantes e crianças de até 6 anos**.
- Objetivos: cobertura vacinal, frequência escolar, transferência de renda (Bolsa Família).
- Resultados relatados: +10% de frequência escolar entre alunos de baixa renda; 25% dos evadidos retornaram; +7 p.p. em renovações do Bolsa Família.
- **Venceu o Bloomberg Philanthropies Mayors Challenge 2025-2026** (US$ 1 milhão).

**Implicação direta para o pitch:** a prefeitura **já acredita** em agente conversacional no WhatsApp + cruzamento de bases + busca ativa, e já tem prova de resultado. Uma solução que se posicione como **extensão do Pref Rio para o funil da creche** tem caminho de adoção muito mais curto — e um pitch que ignore o Pref Rio parece desinformado. Também há um **guia de uso ético de IA no serviço público** criado pela prefeitura e um acordo de governança digital entre o Conselho Municipal de Proteção de Dados e a SMCT.

**Alerta de reputação:** a prefeitura já lançou um "modelo de IA próprio" que sofreu críticas técnicas duras e admitiu erro publicamente. Times que prometerem mais do que entregam tocam numa ferida recente. Sobriedade técnica vende aqui.

---

## 5. Restrições que a banca provavelmente vai testar

- **LGPD art. 14** — dados de crianças e adolescentes exigem **melhor interesse** da criança e, em regra, consentimento específico de ao menos um dos pais/responsável. Setor público usa outras bases legais (execução de política pública), mas o crivo é mais rígido. ANPD está em ciclo de fiscalização do **ECA Digital** em 2026.
- **Dados sensíveis embutidos no próprio processo:** violência doméstica, deficiência, doença crônica, dependência química, familiar preso, condição de refugiado. Qualquer solução que processe a pontuação está tratando **dado sensível de criança em situação de vulnerabilidade**. Minimização, retenção curta, log de acesso e não-inferência são obrigatórios, não enfeite.
- **Equidade algorítmica:** um sistema que "otimiza alocação" pode reproduzir desigualdade territorial. Toda pontuação/ranking precisa ser **explicável em linguagem de responsável**, não só auditável por engenheiro.
- **Não substituir a norma:** a pontuação é definida por **resolução da SME**. IA que "decide" quem entra é inviável juridicamente. IA que **ajuda a família a exercer o direito que já tem** e que **ajuda a SME a enxergar a demanda** é viável.
- **Acessibilidade e exclusão digital:** parte do público-alvo é justamente quem tem menos acesso. WhatsApp > app novo. Voz e texto simples > formulário.

---

## 6. Ângulos de solução (hipóteses pré-case, para acelerar o brainstorm)

**A. Copiloto do responsável (o mais alinhado ao Pref Rio)**
Agente no WhatsApp que: descobre a pontuação a que a família tem direito (inclusive critérios que ela nem sabe que possui — CadÚnico é 51 pontos), monta a lista de documentos, lembra da data de comprovação, e explica o resultado. Ataca diretamente o Art. 7º (perda de pontos por não comprovação).

**B. Escolha informada das 5 opções**
Recomendador que, dado o endereço e a pontuação estimada, mostra probabilidade realista de vaga por unidade. Hoje a família escolhe às cegas — e uma escolha ruim custa um ano.

**C. Fila transparente**
"Onde eu estou na fila e o que isso significa" — o dado qualitativo mais repetido pelas mães é a ausência de previsão. Transparência é barata e tem impacto emocional enorme.

**D. Lado gestor: mapa de demanda vs. oferta**
Cruzar inscrições não atendidas por bairro com capacidade instalada para orientar onde abrir vaga/creche parceira. Fala direto com a pressão judicial de zerar a fila.

**E. Triagem documental**
Leitura assistida de documentos comprobatórios para reduzir filas presenciais e erro de digitação. Cuidado: dado sensível, requer human-in-the-loop.

**Filtro de qualidade para qualquer ideia:** ela reduz **fila** ou reduz **fricção**? Se não reduz nenhum dos dois, não é o case. E: a SME consegue rodar isso na segunda-feira?

---

## 7. Perguntas para fazer à SME na abertura

1. Qual métrica a SME quer mover: vagas ocupadas, taxa de comprovação, tempo de espera, ou satisfação?
2. Que dados vêm no case? Base de inscrições anonimizada? Capacidade por unidade? Georreferenciamento?
3. A lista de espera é digital e centralizada hoje, ou ainda é por unidade?
4. Qual a taxa de perda de pontuação por não comprovação? (se ninguém souber, isso já é um achado)
5. Há integração possível com o agente Pref Rio / IplanRio?
6. Quantas vagas ficam ociosas por não confirmação presencial no fim do processo?
7. Quem é o dono do produto do lado da prefeitura depois do hackathon?

---

## 8. Fontes

- [Prefeitura do Rio — 2ª edição do Claude Impact Lab](https://prefeitura.rio/cidade/cidade-do-rio-recebe-segunda-edicao-brasileira-do-claude-impact-lab/)
- [SMDUE — 1ª edição do Claude Impact Lab](https://desenvolvimento.prefeitura.rio/noticias/cidade-do-rio-recebe-primeira-edicao-brasileira-do-claude-impact-lab/)
- [ABIH-RJ — Claude Impact Lab Rio, 30 de agosto](https://abihrj.com.br/blog/claude-impact-lab-rio-2026-vtex-botafogo-inteligencia-artificial-30-agosto)
- [Resolução SME nº 542, de 18/11/2025 (PDF)](https://educacao.prefeitura.rio/wp-content/uploads/sites/42/2025/11/RESOLUCAO-SME-N%C2%B0-542-DE-18-DE-NOVEMBRO-DE-2025-1.pdf)
- [Portal 1746 — Informações sobre matrícula na rede municipal 2026](https://www.1746.rio/hc/pt-br/articles/43650377990043-Informa%C3%A7%C3%B5es-sobre-matr%C3%ADcula-na-rede-municipal-2026)
- [matricula.rio — Consulta Creche](https://matricula.rio/ConsultaCreche)
- [SME — Perguntas Frequentes](https://educacao.prefeitura.rio/perguntas-frequentes/)
- [Defensoria RJ — Justiça manda zerar fila de creches](https://defensoria.rj.def.br/noticia/detalhes/30136-RJ-Justica-nega-recurso-da-Prefeitura-e-manda-zerar-fila-de-creches)
- [Defensoria RJ — Justiça multa Prefeitura em mais de R$ 2 bi](https://defensoria.rj.def.br/noticia/detalhes/29788-Vaga-em-creche-Justica-multa-Prefeitura-do-Rio-em-mais-de-R-2bi)
- [SEPE — Creches deixam de fora 13 mil crianças](https://seperj.org.br/denuncia-creches-no-municipio-do-rio-deixam-de-fora-13-mil-criancas/)
- [Gênero e Número — Em favelas do Rio, mães sofrem com escassez de creches](https://www.generonumero.media/reportagens/creches-favelas-rio/)
- [Agência Brasil — Falta de acesso a creches impacta mulheres de favelas](https://agenciabrasil.ebc.com.br/educacao/noticia/2025-03/falta-de-acesso-creches-e-escolas-impacta-mulheres-de-favelas)
- [Prefeitura do Rio — Agente de IA no WhatsApp (Pref Rio)](https://prefeitura.rio/cidade/rio-lanca-agente-de-ia-no-whatsapp-para-conectar-cidadaos-a-servicos-publicos-e-combater-vulnerabilidades/)
- [IplanRio — Reconhecimento global por projeto com IA](https://iplanrio.prefeitura.rio/noticias/rio-e-reconhecido-globalmente-por-projeto-com-ia-e-reforca-papel-da-iplanrio-na-inovacao-publica/)
- [Prefeitura do Rio — Vencedora do Mayors Challenge 2025-2026](https://prefeitura.rio/iplanrio/prefeitura-e-uma-das-vencedoras-do-premio-desafio-de-prefeitos-2025-2026-da-bloomberg-philanthropies/)
- [Diário do Rio — Guia de uso ético de IA no serviço público](https://diariodorio.com/prefeitura-do-rio-cria-guia-para-orientar-uso-etico-da-inteligencia-artificial-no-servico-publico)
- [Rio.IA — Hub carioca de Inteligência Artificial](https://cienciaetecnologia.prefeitura.rio/rio-ia/)
- [data.rio — Escolas Municipais](https://www.data.rio/datasets/escolas-municipais/about)
- [LGPD art. 14 — Dados de crianças e adolescentes](https://lgpd-brasil.info/capitulo_02/artigo_14)
