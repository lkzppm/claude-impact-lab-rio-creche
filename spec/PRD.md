# PRD — Inscrição Creche: classificação por criança e painel de convocação

> Documento de produto do que está sendo construído no hackathon (30/08/2026). Complementa o contrato
> técnico em [11-baseline-tecnico.md](11-baseline-tecnico.md). Estado: **em construção** — a seção
> "Status" no fim diz o que já roda.

## 1. Problema

A SME-Rio classifica ~45 mil inscrições por processo em **filas por unidade × turno**. A mesma criança é
classificada em cada uma das até 5 unidades que escolheu, e o sistema **oferta até 5 vagas ao mesmo CPF**
ao mesmo tempo. Cada oferta abre um prazo de 3 dias; enquanto uma família decide, as outras vagas dela
ficam congeladas — e a próxima da fila também segura várias. A cascata roda no calendário
(3 dias × profundidade da cadeia), e o ano começa com **vagas ociosas e fila ao mesmo tempo**.

A equipe do polo/CRE acompanha isso **sem painel e sem carimbo de tempo**: não há registro de quando uma
opção mudou de status. (Briefing SME, "Problema central" e gap nº 1 — [02](02-case-oficial.md).)

Números que sustentam o problema ([09](09-achados-dos-dados.md), ordem de grandeza):
- ~6 mil crianças/ano recebem uma vaga e terminam o processo sem vaga (82% de quem passa por
  `Cancelado na confirmacao`);
- 47% das inscrições de 2025 usam uma única opção; escolhas fora do bairro convertem 1,4× menos;
- a régua de pontuação mudou em 2024 e 2025; a comprovação presencial é cega no dado desde 2022.

## 2. Objetivo desta entrega

Duas peças, uma só base de dados:

1. **Motor de classificação por criança.** Substitui o script "fila por unidade" por um algoritmo de
   aceitação diferida (Deferred Acceptance, lado da criança propondo) que consome **exatamente** a
   pontuação da resolução e a ordem de preferência da família, e devolve, para cada criança:
   - **até 3 vagas reservadas ("presas")** simultaneamente, nas unidades mais preferidas em que a
     pontuação alcança; reservadas por 72 h;
   - **até 2 alternativas "selecionáveis"**: as opções restantes, com posição na fila daquela unidade,
     sem vaga presa;
   - um **log de decisão** por criança ("não entrou na unidade X porque as N vagas foram para pontuação
     ≥ Y"), que vira a explicação para a família.

   A família confirma **uma** das reservadas; as outras duas são liberadas **na hora** e voltam ao pool
   para uma rodada restrita (rematch). Recusa ou prazo vencido libera só aquela vaga.

   O motor também roda com `vagas_presas = 1` (DA clássico, uma vaga por criança) para a simulação
   comparar os dois regimes sobre o processo 2025.

2. **Painel de convocação da CRE/polo.** Toda transição de status vira um **evento com carimbo de
   tempo** (log append-only). O painel mostra, por unidade e por criança: há quanto tempo cada vaga
   está "Selecionada" (faixas 0–24 h / 24–48 h / 48–72 h / >72 h), vagas em risco de ociosidade, famílias
   sem contato, crianças com mais de uma reserva aberta, vagas liberadas hoje. Operado pelo servidor do
   polo sem treino.

3. **Comprovação automática de critérios** (mock com formato real). No ato da inscrição, os critérios
   declarados (CadÚnico, Bolsa Família, CPF do responsável) são consultados nas **APIs de governo** em vez
   de comprovação presencial em papel. Nesta fase a consulta é **simulada**, mas os adaptadores seguem o
   contrato real:

   | Critério | API real | Endpoint | Campos usados |
   |---|---|---|---|
   | CadÚnico (51 pts) e Bolsa Família (5 pts) | **Conecta gov.br — CADÚNICO Serviços Dados Familiares** (MDS) | `GET /api-cadunico-servicos-dados/v1/dp/dadosFamiliar/{cpf}` ou `/nis/{nis}` | `pessoaCadastrada`, `cadastroAtualizado`, `familiabeneficiariaBolsaFamilia`, `faixaRendaFamiliarPerCapita`, `municipio.codigoIBGE`, `quantidadePessoasFamilia`, `dataUltimaAtualizacao` |
   | Identidade e situação do CPF do responsável | **Conecta gov.br — CPF Light v2** (RFB) | `POST /api-cpf-light/v2/consulta/identificacao` com `{"listaCpf": [...]}` | `Nome`, `SituacaoCadastral` (0 regular, 2 suspensa, 3 titular falecido, 4 pendente, 5/9 cancelada, 8 nula), `DataNascimento` |
   | Contato e endereço mais recentes da família | **Registro Municipal Integrado** (IplanRio) | tabela `rj-crm-registry.rmi_dados_mestres.pessoa_fisica` (data lake) | `telefone.principal`, `endereco.principal` (cep, bairro, latitude, longitude), `saude.clinica_familia` |

   Autenticação real: OAuth2 client-credentials no gateway do Conecta
   (`/oauth2/jwt-token`, token de 2 h), acesso condicionado à adesão do órgão e liberação de IP no
   SERPRO; RMI via solicitação de acesso interno da Prefeitura. A pontuação **continua** sendo a da
   resolução; a comprovação só confirma (ou não) o critério declarado — Art. 7º da Res. 542/2025.

## 3. O que NÃO muda

- A **tabela de pontuação** (Res. SME 542/2025) e os critérios de desempate. Norma, não parâmetro.
- O portal de inscrição (`matricula.rio`) e a unidade como lugar da confirmação de matrícula.
- Nenhum LLM decide alocação. Nesta fase não há LLM em lugar nenhum; ele entra depois, sobre o log de
  decisão (explicação à família) e sobre o log de eventos (interrogação do gestor).

## 4. Usuários

| Usuário | O que faz no produto |
|---|---|
| **Servidor do polo/CRE** (usuário principal) | Abre o painel, vê o que está atrasado, registra tentativas de contato e o desfecho de cada convocação, roda rematch |
| **Nível Central SME** | Executa a rodada inicial de classificação, compara regimes (1 vaga vs 3 presas), audita o log |
| **Família** (indireta nesta fase) | Recebe a explicação do resultado gerada a partir do log; a conversa por WhatsApp é fase 2 |

## 5. Fluxos

**Rodada inicial.** Nível Central escolhe `ano`, `grupamento`, `horario`, `vagas_presas` (3) e
`alternativas` (2) → motor roda por (grupamento, turno) → `rodada` + `alocacao` gravadas com
`hash_entrada` → resumo: inscrições, crianças com alguma reserva, média de reservas por criança, lista de
espera, sem opção viável, distribuição por ordem da opção.

**Convocação.** "Gerar convocações" cria uma `convocacao` (status `selecionada`, prazo +72 h) por vaga
reservada e o evento correspondente. O servidor registra `contato_tentado` (repetível),
`contato_confirmado`, `confirmada`, `recusada`, `expirada`. `confirmada` em uma unidade →
as outras reservas da mesma criança viram `liberada` automaticamente, com evento.

**Rematch.** Vagas liberadas/recusadas/expiradas voltam ao pool → rodada `tipo = rematch` restrita às
unidades com vaga e às crianças em lista de espera, mesma régua.

**Comprovação.** `POST /inscricoes/{id}/comprovar` consulta os provedores configurados
(`COMPROVACAO_PROVIDER=mock` nesta fase) e grava uma linha por critério com fonte, resultado, protocolo e
payload. A ficha da inscrição mostra o resultado.

## 6. Dados

- Carga inicial a partir das bases da SME (2021–2025) com DuckDB → PostgreSQL. **Capacidade é
  estimada** (nº de `Confirmado` por unidade/grupamento/turno/ano) e marcada `fonte = estimada_confirmados`.
- Auditoria automática das bases antes da carga: `out/auditoria-dados.md`. O que ela encontrou está
  registrado ali; os tratamentos estão em `backend/app/etl/readers.py`.
- LGPD: só códigos anônimos da SME; o mock de comprovação nunca recebe CPF real; log de eventos guarda
  ator e hora, não conteúdo de conversa.

## 7. Métricas de sucesso (demo e produção)

| Métrica | Como medimos |
|---|---|
| Vagas presas por criança | por construção: ≤ 3 (hoje até 5); comparável com 1 |
| Crianças com alguma oferta na 1ª rodada | resumo da rodada, regime 1 vs 3 |
| Tempo até a última vaga ocupada | simulação da cascata (hoje 3 dias × profundidade; motor: 3 dias) |
| Vagas em risco visíveis ao polo | painel, faixa >48 h |
| Tempo de convocação até desfecho | log de eventos (dado que hoje não existe) |

## 8. Fora de escopo nesta fase

Agente de WhatsApp/Pref Rio, assistente de escolha das 5 opções, validação real via RMI/Conecta com
credenciais, planejamento por coorte (SINASC × capacidade). Todos descritos em
[04](04-analise-tecnica.md) e no fluxograma do time.

## 9. Riscos e decisões registradas

- **3 reservas por criança reintroduz vaga presa** (3 em vez de 5). Mitigação: prazo de 72 h, liberação
  imediata na confirmação, rematch rolante, e comparação explícita com o regime de 1 vaga na demo.
  Decisão do time em 30/08, 11h30.
- **Capacidade estimada** pode estar errada por unidade; o painel mostra a fonte e permite correção
  (`fonte = informada`).
- **Sem carimbo de tempo na base histórica** — o painel é demonstrado sobre eventos simulados e isso é
  dito na banca.
- **APIs de governo exigem adesão institucional** — o mock reproduz o contrato para que a troca seja de
  configuração, não de código.

## 10. Status

| Peça | Estado |
|---|---|
| Contrato técnico (`spec/11`) | pronto |
| Leitores robustos das bases (`backend/app/etl/readers.py`) | pronto, testado sobre as 4,3 M linhas |
| Auditoria (`backend/app/etl/audit.py` → `out/auditoria-dados.md`) | em construção |
| Carga Postgres (`backend/app/etl/load.py`) | a fazer |
| Motor DA com `vagas_presas` (`backend/app/engine/`) | em construção |
| API FastAPI (`backend/app/routers/`) | em construção |
| Adaptadores de comprovação (`backend/app/integracoes/`) | em construção (mock + contrato real) |
| Frontend React com design system do matricula.rio (`frontend/`) | em construção |
| `docker-compose` (db + backend + frontend) | em construção |
