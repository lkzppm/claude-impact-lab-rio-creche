# Análise do Case — 3 pilares da matrícula em creche (SME-Rio)

> Case oficial recebido no hackathon: melhorar **Planejamento**, **Inscrição & Classificação** e **Convocação** do sistema atual (matricula.rio).
> Este documento é a análise técnica + ângulos de ataque. Contexto institucional e legal: ver `00_BRIEFING_CONTEXTO.md`.

---

## Diagnóstico em uma frase

Os três problemas parecem separados, mas são o **mesmo defeito estrutural em três momentos**:
o sistema trata **oferta e demanda como listas independentes que se encontram por processo manual e sequencial**, em vez de como um **casamento que se resolve de uma vez só, em software**.

| Pilar | O sintoma que a SME relata | A causa raiz |
|---|---|---|
| Planejamento | Projeção baseada no tamanho da fila do ano anterior | A fila é um **sinal censurado** — mede demanda *manifestada*, não demanda *real* |
| Inscrição/Classificação | Ano começa com **vagas ociosas** + contatos desatualizados; escolhas geograficamente inviáveis | A família escolhe **às cegas**; a comprovação é manual (Creche ↔ Diretoria ↔ CRE) |
| Convocação | 3 dias por convocação, sem rastreio; criança "prende" várias vagas e encadeia atrasos | O mecanismo é de **aceitação imediata com convocação sequencial** — a cascata roda no *calendário*, não no *computador* |

---

# PILAR 3 — CONVOCAÇÃO
## (começo por aqui: é o problema mais bem definido, o mais demonstrável em 1 dia e o de maior impacto)

### O que está realmente acontecendo

Hoje a criança pode ser **classificada em mais de uma das 5 unidades** que escolheu. Cada unidade a convoca e espera **3 dias**. Enquanto isso, a vaga nas outras unidades fica **congelada**. Quando a criança finalmente aceita uma, as outras vagas são liberadas — e a próxima criança da fila entra em outra convocação de 3 dias, que pode estar **na mesma situação**. A cascata se propaga.

**A matemática do problema:** se a liberação de uma vaga depende serialmente de uma decisão de 3 dias, e a criança seguinte também segura múltiplas vagas, o tempo para estabilizar o sistema é `3 dias × profundidade da cadeia`. Com cadeias de 5–10 níveis, isso é **15 a 30 dias letivos** com vaga vazia e criança na fila. É exatamente o que a SME descreve como "ano começando com vagas ociosas".

### O insight central

> **Isso não é um problema de contato. É um problema de mecanismo.**
> A cascata não precisa acontecer no mundo real. Ela pode ser resolvida por inteiro **dentro do computador, em milissegundos**, e só o resultado final vira convocação.

Esse é exatamente o problema que o **Deferred Acceptance (Gale-Shapley)** resolve — o algoritmo usado no *school choice* de Nova York, no SiSU brasileiro e no Sistema de Admisión Escolar do Chile.

**Como o DA elimina o problema por construção:**
1. Cada criança "candidata-se" à sua 1ª opção.
2. Cada unidade retém **tentativamente** as crianças mais bem classificadas até a capacidade, e rejeita o excedente.
3. Cada criança rejeitada candidata-se à próxima opção; unidades **reavaliam e podem trocar** quem retêm.
4. Repete até estabilizar.

**Propriedade-chave:** em nenhum momento uma criança segura mais de uma vaga. A "cascata de 3 dias" vira **iteração de laço**. A convocação passa a ser **uma só, para uma vaga só**.

### Por que isso é juridicamente seguro (argumento essencial para a banca)

O DA **não altera quem tem prioridade**. Ele consome exatamente:
- a **ordem de preferência da família** (a Res. SME 542/2025 já pede "até 5 opções em ordem de preferência"); e
- a **ordem de prioridade da unidade** (a própria tabela de pontuação da resolução: CadÚnico 51, Educação Especial 15, ... + desempates: irmão na rede → responsável menor de 18 → ordenação eletrônica).

> **A SME já coleta os dois insumos que o DA precisa. Ela simplesmente ainda não roda o DA.**

O resultado é **estável** (nenhuma dupla criança-creche prefere trocar) e **auditável linha a linha**: para cada criança dá para responder "você não entrou na unidade X porque as N vagas foram para crianças com pontuação ≥ Y". Isso é mais explicável para a família do que o processo atual, não menos.

**Evidência empírica (NYC, MIT Blueprint Labs):** no sistema descentralizado anterior, **~1/3 dos alunos ficava sem alocação** na rodada principal e era realocado administrativamente. Com alocação coordenada, capturou-se **80% do ganho possível** de bem-estar — e os autores concluem que **"coordenar as ofertas domina os efeitos de refinamentos adicionais no algoritmo"**. Ou seja: o ganho vem de coordenar, não de sofisticar. Isso é ótimo para um hackathon de 1 dia.

### O que construir

**Núcleo (determinístico, sem LLM):** motor de DA que lê inscrições + pontuações + capacidade por unidade/turma e devolve o matching estável, com log de decisão por criança.

**Borda (aqui entra o Claude):**
- **Agente de convocação no WhatsApp**: notifica, confirma recebimento, responde dúvida ("posso levar depois?", "que documento?"), permite **confirmar ou recusar na conversa** — a recusa devolve a vaga ao pool na hora, não em 3 dias.
- **Escalada multicanal rastreada**: WhatsApp → SMS → ligação → agente comunitário/creche mais próxima. Cada etapa com carimbo de tempo. O relógio de 3 dias começa a contar **do contato confirmado**, não do envio.
- **Rematch rolante**: vaga recusada ou vencida volta ao pool e dispara nova rodada de DA restrita — São Paulo faz exatamente isso com uma **rotina noturna de compatibilização** no sistema EOL. Prova de que rodar todo dia é operacionalmente viável.
- **Painel de rastreio para a CRE**: onde está cada convocação, quantas vagas em risco de ociosidade, quais famílias sem contato.

### Métrica de sucesso
Dias de vaga ociosa no início do ano letivo · taxa de contato efetivo na 1ª convocação · nº de vagas presas simultaneamente por criança (meta: **1, por construção**) · tempo médio da convocação até a matrícula efetivada.

---

# PILAR 2 — INSCRIÇÃO E CLASSIFICAÇÃO

### Os três sub-problemas (são distintos, tratar separado)

#### 2a. Escolha geograficamente inviável
A família escolhe 5 unidades **sem nenhum feedback**: não sabe a distância real, não sabe quantas vagas a unidade tem, não sabe se sua pontuação dá chance ali. Escolha ruim = ano perdido. E a resolução **não tem regra de proximidade** — a preferência é 100% da família.

**Benchmark decisivo — São Paulo:** a plataforma *Vaga na Creche*/EOL usa **georreferenciamento com raio** (1,5 km para berçário, 2 km para mini grupo), permite **cadastrar um segundo endereço** (adicionado em 2019, para o endereço do trabalho ou da avó) e roda **compatibilização noturna**. São Paulo saiu de **170 mil na fila** para **zero** — e mantém zerada. Os ~595 restantes esperam **por preferência específica de unidade**, não por falta de vaga.

> Ter um benchmark brasileiro que zerou a fila é o argumento mais forte possível diante de uma prefeitura sob ordem judicial de zerar a fila em 90 dias.

**O que construir:** assistente de escolha que, no ato da inscrição, mostra para cada unidade — distância real (a pé/transporte, não linha reta), vagas por faixa etária, e **probabilidade calibrada de admissão** dada a pontuação estimada da família ("nesta unidade, no ano passado, a última criança admitida tinha 56 pontos; a sua estimativa é 51 → chance baixa"). Mais o **segundo endereço** (trabalho/cuidador), que é barato de implementar e destrava muito matching.

#### 2b. Pontuação perdida por não comprovação
O Art. 7º da Res. 542/2025 **zera a pontuação de qualquer critério não comprovado** presencialmente na data marcada. Com CadÚnico valendo 51 dos ~100 pontos, **perder a comprovação é perder a vaga** — e quem mais perde é exatamente quem mais precisa.

**O que construir:** agente que descobre a que pontuação a família tem direito (inclusive critérios que ela não sabe que possui), monta a lista personalizada de documentos, lembra da data, e faz **pré-validação documental multimodal** (foto do documento → checagem de legibilidade, tipo e validade **antes** de a família se deslocar). A CRE deixa de receber pilha de papel e passa a receber **fila de exceções**.

#### 2c. Confirmação manual Creche ↔ Diretoria ↔ CRE
Três atores conferindo o mesmo dado em planilha/papel. É onde nasce a divergência de contato e o descompasso entre "vaga que existe no sistema" e "vaga que existe na creche".

**O que construir:** uma **fonte única de verdade** da capacidade por unidade/turma, com atualização pela própria unidade e trilha de auditoria. Sem isso, qualquer algoritmo de alocação está otimizando em cima de número errado.

#### 2d. Contatos desatualizados (transversal aos pilares 2 e 3)
**Não resolver isso na hora da convocação — é tarde.** Resolver na inscrição, meses antes.
- **Enriquecimento cruzado:** o telefone mais recente da família provavelmente já existe em **outra base municipal** (CadÚnico, Saúde/SUS, Bolsa Família, Assistência Social). O agente **Pref Rio** da IplanRio **já faz esse join entre secretarias** e já fala com ~135 mil pessoas vulneráveis, com foco em gestantes e crianças até 6 anos.
- **Ping de verificação**: uma mensagem no WhatsApp no ato da inscrição e outra antes do resultado, só para validar o canal.

> Reaproveitar o Pref Rio em vez de propor um canal novo é o caminho mais curto para adoção — e a prefeitura já ganhou o Bloomberg Mayors Challenge com ele.

### Métrica de sucesso
% de inscrições com ≥1 opção viável (dentro do raio + com chance real) · % de critérios pontuados efetivamente comprovados · % de contatos válidos na convocação · nº de vagas ociosas em março.

---

# PILAR 1 — PLANEJAMENTO

### O erro estatístico que está no centro do método atual

> **Usar o tamanho da fila do ano anterior para projetar o ano seguinte mede quem se inscreveu, não quem precisa.**

A fila é um sinal **censurado e endógeno**:
- Família que sabe que não tem creche no bairro **não se inscreve**. A demanda some do dado exatamente onde o déficit é maior.
- Família cuja pontuação nunca dá chance **desiste de tentar** no ano seguinte.
- Pior: isso cria um **loop de retroalimentação** — bairro sem oferta gera fila pequena, fila pequena justifica não abrir vaga, e o bairro segue sem oferta. É desigualdade territorial se auto-perpetuando dentro do modelo de planejamento.

A reportagem do Gênero e Número mostra o efeito: Rio das Pedras com 8 estabelecimentos (6 municipais), Rocinha com 21 unidades das quais só 6 públicas. Não é que a demanda seja menor ali.

### O dado que resolve isso — e que já existe

> **Toda criança que vai precisar de creche em 2029 já nasceu.**

O **SINASC** (nascidos vivos, por município e endereço de residência da mãe) dá a **coorte completa 0–3 anos com 3 anos de antecedência**. Isso não é previsão, é quase contagem. Sobre essa base, o que falta estimar é só a *taxa de procura* — e essa sim se modela com covariáveis socioeconômicas.

**Pilha de dados proposta (do mais para o menos disponível):**

| Fonte | O que entrega |
|---|---|
| **SINASC** — nascidos vivos por residência da mãe | Denominador real da coorte 0–3, por território, com 3 anos de antecedência |
| **CadÚnico** georreferenciado | Onde estão as famílias que somam 51 pontos — a demanda prioritária real |
| **Bolsa Família / SUS / Assistência Social** | Cruzamento já feito pelo Pref Rio; captura quem nunca apareceu na fila |
| **IBGE / setor censitário** | População 0–3 e projeções; correção de migração intraurbana |
| **data.rio — Escolas Municipais** | Capacidade instalada georreferenciada (a oferta) |
| **Histórico de inscrições do matricula.rio** | Preferência revelada: quais unidades as famílias *querem*, não só onde há vaga |

### O que construir

**Mapa de demanda potencial vs. oferta instalada, por território e por faixa etária** (berçário ≠ mini grupo — a decisão de obra depende disso), com:
- **Índice de demanda reprimida não manifesta** = crianças 0–3 no território (SINASC/CadÚnico) − matriculadas − na fila. **Esse número é o achado.** Ele torna visível a demanda que o método atual apaga.
- **Projeção 3 anos à frente** por coorte, não por extrapolação de fila.
- **Ranking de onde abrir vaga** por criança-não-atendida por vaga criada, ponderado por vulnerabilidade.
- **Interrogação em linguagem natural pelo gestor** (aqui o Claude brilha do lado do gestor): *"quanto falta de berçário em Rio das Pedras em 2027?"* → resposta com o dado, a fonte e a incerteza.

### Os dois ganchos institucionais (colocar no pitch)

1. **Lei 14.851/2024** tornou a **mensuração anual da demanda por educação infantil obrigatória**, exigiu que fosse feita **de forma articulada com Saúde, Assistência Social e proteção à infância**, e — o ponto que abre orçamento — transformou o levantamento em **critério de prioridade na destinação de recursos federais para expansão de vagas**. Melhorar o planejamento não é só gestão: **é dinheiro federal**.
2. **Retrato da Educação Infantil 2025 (Conviva):** só **metade** dos municípios sabe a quantidade e a idade exatas das crianças em demanda; **48,4%** não têm formato integrado de gestão; só **57,9%** publicam dados de lista de espera; só **40,8%** têm Plano de Expansão de Vagas. O Rio tem chance de virar referência nacional com pouca coisa.

### Métrica de sucesso
Erro de previsão por território (vs. o baseline "fila do ano anterior") · cobertura da coorte 0–3 identificada · nº de territórios com demanda reprimida antes invisível · aderência do plano de expansão à demanda projetada.

---

# Arquitetura recomendada (e o argumento que vende)

> **IA na borda, algoritmo determinístico no núcleo.**

| Camada | Tecnologia | Por quê |
|---|---|---|
| Conversa com a família (inscrição, comprovação, convocação) | **LLM / Claude** | Linguagem natural, WhatsApp, explica pontuação, coleta preferência ("trabalho na Barra até 19h30") |
| Leitura e pré-validação de documentos | **LLM multimodal + human-in-the-loop** | Reduz deslocamento e fila presencial; nunca decide sozinho |
| Explicação do resultado ao responsável | **LLM sobre o log de decisão** | Transparência real, em linguagem de família |
| **Alocação de vagas** | **Deferred Acceptance determinístico** | **Auditável, reprodutível, juridicamente defensável. NÃO usar LLM aqui.** |
| Previsão de demanda | Modelo estatístico por coorte + geoespacial | Explicável e checável contra o SINASC |
| Interrogação do gestor | **LLM sobre o modelo** | Acesso ao dado sem depender de analista |

**Dizer isso explicitamente à banca é um diferencial.** Diante de uma prefeitura que já publicou um guia de uso ético de IA no serviço público, tem Conselho Municipal de Proteção de Dados e **já se queimou publicamente ao anunciar um "modelo de IA próprio"**, o time que declara *"aqui a IA não decide quem entra na creche — quem decide é a resolução, e o algoritmo é auditável"* ganha credibilidade que nenhuma demo compra.

---

# Se der para escolher só um recorte

**Convocação com DA + agente de WhatsApp.** Razões:
1. É o único dos três em que dá para **provar o ganho na hora**, com simulação: rodar o processo atual vs. DA sobre dados sintéticos e mostrar `vagas ociosas × dias` despencando.
2. É o mais **legalmente seguro** — preserva a pontuação da resolução intacta.
3. É o que **fala direto com a ordem judicial** de zerar a fila.
4. Tem **precedente municipal de adoção** (Pref Rio) e **benchmark nacional de resultado** (São Paulo zerou a fila).

**Demo que convence:** um contador na tela. "Processo atual: 340 vagas ociosas por 18 dias = 6.120 criança-dias perdidos. Com alocação coordenada: 12 vagas ociosas por 2 dias = 24." Um número, uma tela, sem jargão.

---

# Armadilhas a evitar

- ❌ Propor mudar a **tabela de pontuação** — é norma (Res. SME 542/2025), não código. Mata o projeto na banca.
- ❌ LLM decidindo alocação — indefensável perante LGPD art. 14, ECA e controle externo.
- ❌ Propor **app novo** — o público-alvo é de baixa conectividade. WhatsApp, 1746, Carioca Digital e Rioeduca já existem.
- ❌ Otimizar alocação sobre **capacidade não confiável** — sem fonte única de verdade da vaga, o algoritmo erra com precisão.
- ❌ Ignorar o **Pref Rio** e o **EOL de São Paulo** no pitch — passa a impressão de que o time não pesquisou.
- ❌ Prometer integração que a SME não consegue entregar — o prêmio é a **doação do projeto à cidade**; o que não roda, não vale.

---

# Perguntas para a SME (as que mais mudam o projeto)

1. Existe hoje uma **base única de capacidade por unidade e turma**, ou o número vem de cada creche?
2. A criança pode mesmo ser **classificada em mais de uma das 5 opções simultaneamente**? Quantas, em média?
3. Qual a **profundidade média da cascata** de convocação e quantos dias letivos ela consome?
4. Quantas vagas ficam **ociosas em março** e quantas crianças seguem na fila nesse mesmo momento?
5. Qual o **% de contatos inválidos** na convocação?
6. Que **campos** vêm na base de inscrição do case? Tem endereço georreferenciável? Pontuação final? Ordem de preferência das 5 opções?
7. A SME tem acesso a **SINASC / CadÚnico georreferenciado**, ou isso passa por Saúde e Assistência Social?
8. Dá para integrar com o **Pref Rio** da IplanRio, ou o canal teria que ser novo?

---

## Fontes adicionais desta análise

- [MIT Blueprint Labs — Welfare Effects of Coordinated Assignment (NYC)](https://blueprintlabs.mit.edu/research/the-welfare-effects-of-coordinated-assignment-evidence-from-the-new-york-city-high-school-match)
- [Prefeitura de SP — Plataforma Vaga na Creche](https://educacao.sme.prefeitura.sp.gov.br/entenda-como-funciona-a-plataforma-vaga-na-creche/)
- [Prodam — Fila de creche zerada pelo segundo ano consecutivo](https://portal.prodam.sp.gov.br/w/fila-para-matricular-criancas-em-creches-da-prefeitura-se-mantem-zerada-pelo-segundo-ano-consecutivo)
- [Agência Brasil — Lei 14.851/2024, mensuração obrigatória da demanda](https://agenciabrasil.ebc.com.br/educacao/noticia/2024-05/prefeituras-deverao-manter-atualizadas-dados-sobre-demanda-por-creches)
- [Conviva Educação — Retrato da Educação Infantil 2025](https://convivaeducacao.org.br/fique_atento/5855)
- [Sistema de Admisión Escolar (Chile) — algoritmo 2026](https://www.13.cl/programas/servicios-13/servicios/sistema-de-admision-escolar-2026-asi-funciona-el-algoritmo-que-reemplazara-a-la-tombola)
- [matricula.rio](https://matricula.rio/)
