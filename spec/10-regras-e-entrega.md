# 10 — Regras, agenda e critérios de julgamento

> Fonte: [`taicor-ai/claude-impact-lab-rio-2`](https://github.com/taicor-ai/claude-impact-lab-rio-2) —
> repositório oficial do evento.

## Agenda — domingo, 30/08/2026

| Horário | Momento |
|---|---|
| 8h30 | Briefing do desafio |
| 9h00 | Início do hackathon, com apoio dos mentores |
| 12h–13h | Almoço servido (não precisa parar) |
| **16h30** | **Prazo de entrega dos projetos no GitHub** |
| 16h30 | Palestras no auditório |
| 17h30 | Apresentação dos 5 times finalistas |
| 18h30 | Premiação e encerramento |
| 18h30–20h | Happy hour e networking |

## Regras

1. **O projeto começa no evento.** O primeiro commit deve ser feito **após as 09h00 de 30/08**.
   Projetos com evidência de desenvolvimento anterior são **desclassificados**. Bibliotecas, frameworks e
   APIs preexistentes podem ser usados; a **lógica do projeto** deve ser construída no dia.
2. **Uma submissão por equipe**, por e-mail para **eventos@taicor.ai**, com o **número do grupo no assunto
   e no corpo**. Submissões progressivas são aceitas; vale a versão mais recente até o prazo.
3. **Prazo final 16h30.** Depois disso, desconsiderado.
4. **Repositório público no GitHub**, para permitir acesso do governo e a avaliação.
5. **Uso responsável dos dados da cidade.** APIs públicas, dados abertos e os dados fornecidos pela
   secretaria. **Nada de scraping** ou uso indevido dos sistemas da cidade.

> ✅ **Status deste repositório:** público, primeiro commit em **30/08 às 09h44** — dentro da regra.
> A `spec/` documenta contexto e análise; a lógica da solução é construída durante o evento.

## Conteúdo obrigatório do README de entrega

- **Nome da equipe**
- **Membros da equipe**
- **Resumo** — breve explicação da solução
- **Arquitetura / abordagem** — como o Claude foi usado para **construir** e como ele **atua dentro** da
  aplicação
- **Links** — URL da aplicação, se publicada
- **Vídeo demo de 60s** — opcional se a aplicação estiver publicamente acessível; **obrigatório** caso contrário

## Apresentação dos finalistas

Cinco times finalistas, anunciados na hora. **6 minutos** cada, no auditório (Comuna), a partir das 17h30.
**Não é possível estourar o tempo** — aos 6 minutos a apresentação é encerrada.

Slides são opcionais; explicação verbal + live demo bastam. Mostre a dor, demonstre ao vivo e seja honesto
sobre o que está pronto hoje versus o que viria depois.

## Critérios de julgamento

Nota final = (Impacto Real × 8) + (Produto × 4) + (Engenharia × 4) + (Ideia × 2) + (Apresentação × 2).
Cada critério de 1 a 5. Máximo 100.

| # | Critério | Peso | Pergunta central |
|---|---|---:|---|
| 1 | **Impacto Real** | **40** | A prefeitura usaria isso hoje para gerar impacto real? |
| 2 | Produto | 20 | Qual a qualidade do design, da usabilidade e da experiência? |
| 3 | Engenharia | 20 | Qual a qualidade técnica e a escalabilidade para produção? |
| 4 | Ideia | 10 | Desconsiderando o entregue, quão inovadora é a ideia? |
| 5 | Apresentação | 10 | Quão bem o protótipo e a história foram apresentados? |

### O que separa 5 de 4 em cada critério

| Critério | Nota 5 | Nota 4 |
|---|---|---|
| **Impacto Real** | Pronto para usar como está; impacto relevante imediato | Usaria em produção fazendo melhorias; impacto claro e mensurável |
| **Produto** | Servidor não técnico opera de primeira, **sem treino** | Bem desenhado e intuitivo; encaixa no fluxo de trabalho |
| **Engenharia** | Pronto para produção; escalável, **auditável**, generalizável | Robusto, auditável, **lida com dado ruidoso**; caminho claro para produção |
| **Ideia** | Genuinamente nova; faz repensar o problema | Criativa, com ângulo original que destrava o problema |
| **Apresentação** | Pitch impecável; demo ao vivo impressiona; **honesto sobre hoje vs. próximos passos** | Narrativa envolvente; demo ao vivo convincente |

## O que a régua de pontuação implica para as nossas decisões

**Impacto Real vale 40 de 100 — o dobro de qualquer outro critério.** Todo trade-off se resolve por ele.

- A pergunta literal é *"a prefeitura usaria isso **hoje**"*. Integração com o que já existe
  (`matricula.rio`, ICH, RMI, Pref Rio) vale mais que qualquer funcionalidade nova e isolada.
- **"Auditável"** aparece explicitamente em Engenharia 4 **e** 5. É a justificativa técnica de manter
  a alocação determinística e deixar o LLM na borda ([05](05-arquitetura-e-riscos.md)).
- **"Lida com dado ruidoso"** está em Engenharia 4. As armadilhas reais da base — CRLF, `Cancelado na
  confirmacao` sem acento, QueryD sem cabeçalho, régua que muda por ano — não são chateação: tratá-las
  **é** o critério. ([03](03-dados-disponiveis.md#armadilhas-práticas-custam-horas-se-descobertas-às-15h))
- **"Servidor não técnico opera de primeira, sem treino"** define o usuário do Produto: a equipe da
  CRE/polo, não o analista de dados. Um notebook não pontua aqui.
- **"Honesto sobre hoje vs. próximos passos"** está no topo de Apresentação. Os limites do dado
  ([09](09-achados-dos-dados.md#7-o-que-os-dados-não-permitem)) devem ir para o pitch de propósito,
  não ser escondidos.
