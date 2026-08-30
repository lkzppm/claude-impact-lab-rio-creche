# Chamadas de mensageria previstas — Painel da Creche/EDI

Este documento lista as mensagens que o container de mensageria (WhatsApp — já existe no
ecossistema, ver `spec/05-arquitetura-e-riscos.md`) precisaria disparar para sustentar os três
cronogramas do painel da creche. Nenhuma integração real existe ainda: `contato.ts`,
`fluxoAtrasoDocumento.ts` e `fluxoConvocacao.ts` marcam os pontos de disparo com `TODO` e
`console.info`. Este documento é a lista de contrato entre esses `TODO`s e o time que vier a
construir o container de mensageria — cada chamada aqui deveria virar uma linha na tabela
`evento` (tipo `mensageria_enviada`) e, quando aplicável, atualizar um campo no responsável ou na
convocação.

Convenção: toda mensagem é enviada por WhatsApp para o(s) contato(s) da família; texto entre
`{chaves}` é placeholder preenchido pela pipeline. "Resposta esperada" descreve o parsing mínimo
(sim/não, ou nenhuma resposta estruturada — só aviso).

## 1. Verificação de documento (`fluxoAtrasoDocumento.ts`)

| id | disparo | destinatário | resposta esperada |
|---|---|---|---|
| `atraso_documento_dia1` | dia 1 de atraso (prazo de verificação vencido) | contato principal do responsável | nenhuma — é aviso |
| `atraso_documento_dia3_perda_criterios` | dia 3 de atraso | contato principal do responsável | nenhuma — é aviso |

**`atraso_documento_dia1`**
> Olá, {nome_responsavel}. A verificação do documento de {crianca} está em atraso há 1 dia. Se
> passarem mais 2 dias sem verificar, {crianca} deixa de contar com os critérios "tem irmão na
> rede" e "Pequenos Cariocas" na pontuação. Procure a unidade {unidade_nome} para regularizar.

**`atraso_documento_dia3_perda_criterios`**
> Olá, {nome_responsavel}. Como o documento de {crianca} continua sem verificação, os critérios
> "irmão na rede" e "Pequenos Cariocas" não contam mais na pontuação da inscrição. Você ainda pode
> verificar o documento a qualquer momento na unidade {unidade_nome}.

## 2. Convocação — comparecimento presencial (`fluxoConvocacao.ts`)

| id | disparo | destinatário | resposta esperada |
|---|---|---|---|
| `convocacao_confirmacao_visita` | dia 1, e de novo no dia 2 se ainda sem resposta | contato principal | "sim" / "não" → grava em `confirmacaoVisita` |
| `convocacao_perda_vaga` | dia 3, sem confirmação de presença | contato principal | nenhuma — é aviso |

Dia 2 sem resposta também dispara `ligarParaContatoPrincipal` — **não é mensagem automática**, é
uma tarefa manual que aparece na "Central de mensageria" da unidade (a escola liga de verdade).

**`convocacao_confirmacao_visita`**
> Olá, {nome_responsavel}! {crianca} foi convocado(a) para a vaga em {unidade_nome}. Você vai à
> unidade confirmar a matrícula presencialmente? Responda SIM ou NÃO. O prazo é até
> {data_limite_comparecimento}.

**`convocacao_perda_vaga`**
> Olá, {nome_responsavel}. Como não recebemos a confirmação de presença de {crianca} em
> {unidade_nome} dentro do prazo, a vaga foi liberada. Vamos tentar uma nova escola para vocês —
> em breve enviamos uma mensagem perguntando se ainda têm interesse.

## 3. Reparelhamento após perda de vaga (`fluxoConvocacao.ts`)

| id | disparo | destinatário | resposta esperada |
|---|---|---|---|
| `reparelhamento_interesse` | logo após `convocacao_perda_vaga`, ao achar nova escola compatível | até 3 contatos obrigatórios da família, em sequência | "sim" → `confirmarReparelhamento`; sem resposta em nenhum dos 3 em 2 dias → `encerrarInscricaoPorFaltaDeResposta` |

**`reparelhamento_interesse`**
> Olá, {nome_responsavel}. Encontramos uma nova vaga para {crianca} em {nova_unidade_nome}. Você
> ainda tem interesse em vaga na rede municipal? Responda SIM para continuarmos sua inscrição. Se
> não respondermos até {data_limite_resposta}, a inscrição será encerrada.

Não há mensagem separada para "encerramento por falta de resposta" — o aviso de prazo já está no
próprio `reparelhamento_interesse`; o encerramento é silencioso (só grava `evento`).

## Fora do escopo de mensagem automática

- **Resultado de contato manual** (`contato.ts` → `aceitou_visita` / `nao_atendeu` / `recusou`):
  hoje é lançado à mão pelo servidor da unidade nos botões da "Central de mensageria". A ideia de
  produto é que isso vire reflexo automático de `convocacao_confirmacao_visita` assim que o
  container real existir — os botões manuais continuam como fallback.
- **Escolha de unidade para verificação presencial** (`escolherUnidadePresencial`): é uma ação da
  família dentro do painel da família (fora do escopo deste painel de creche), não uma mensagem.
