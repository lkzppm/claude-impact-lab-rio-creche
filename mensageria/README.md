# `mensageria/` — envio de WhatsApp, e-mail e SMS

Serviço que manda as mensagens do fluxo de convocação. Container separado do backend, porta **8100**.

O contrato está em [`spec/11-baseline-tecnico.md`](../spec/11-baseline-tecnico.md), seção *Mensageria*.
Este arquivo é o manual de operação.

## Por que um container só para isso

| | |
|---|---|
| **Credencial isolada** | Chave da Twilio e do Resend ficam neste processo. O backend, que fala com o banco e roda o motor, nunca as carrega. |
| **Falha isolada** | Provedor fora do ar devolve `resultado='falha'` e o backend segue. Convocação não cai porque um SMS não saiu. |
| **Troca sem redeploy** | Sandbox → WhatsApp Business, Resend → relay da Prefeitura: muda variável de ambiente aqui. |

## Como funciona

O backend manda **`template` + `dados`**, nunca texto pronto. O texto mora em
[`app/templates.py`](app/templates.py), versionado e revisável pela SME. Isso também é o que permite migrar
para template aprovado pela Meta (obrigatório no WhatsApp fora da janela de 24 h) mexendo em um arquivo só.

```
POST /api/v1/enviar
{ "canal": "whatsapp", "destino": "21 99999-8888", "template": "convocacao_vaga",
  "dados": {"crianca": "…", "unidade": "…", "grupamento": "Berçário",
            "horario": "Integral", "prazo": "02/09/2026"},
  "referencia": "convocacao:1234", "chave_idem": "convocacao:1234:whatsapp" }
```

| Resultado | Quer dizer |
|---|---|
| `enviado` | o provedor aceitou (não é confirmação de entrega no aparelho — isso exigiria webhook) |
| `simulado` | provedor `mock`: nada saiu, o fluxo foi exercitado |
| `pendente` | provedor real sem credencial; ninguém foi avisado, e isso está explícito |
| `falha` | recusado ou indisponível; `detalhe` traz a mensagem do provedor verbatim |

**Erro de programação falha alto, erro de mundo falha baixo.** Template inexistente, dado faltando ou
destino malformado → **422**, antes de a mensagem existir. Provedor recusando ou fora do ar → **200** com
`resultado='falha'`, porque aviso que não saiu não pode virar erro de API no meio de uma convocação.

## Privacidade (LGPD art. 14)

O log é uma linha JSON por envio com destino **mascarado** (`+5521*****8888`), **impressão digital**
(sha256 truncado, para contar quantas vezes a mesma família foi avisada sem guardar o telefone) e o
resultado. Nunca assunto, texto, dados do template ou destino em claro. Mesmo princípio do
`consulta_agente` do assistente.

## Rodar

```bash
make mensageria        # dev, porta 8100 (padrão mock: nada sai de fato)
make test-mensageria   # 39 testes, nenhum toca a rede
make up                # tudo em containers
curl localhost:8100/api/v1/saude
```

## Ligar os provedores de verdade

Padrão é `mock` em todos os canais — subir o repositório limpo não manda mensagem para ninguém.
Preencha o `.env` da raiz (veja `.env.example`) e troque a variável do canal.

### WhatsApp — Twilio sandbox

O caminho rápido: não exige número próprio, verificação de negócio nem aprovação da Meta.

1. Conta em [twilio.com/try-twilio](https://www.twilio.com/try-twilio) (grátis).
2. Console → **Messaging → Try it out → Send a WhatsApp message**. A tela mostra o número do sandbox e
   um código `join <duas-palavras>`. **O número do sandbox varia por conta** — não presuma o
   `+1 415 523-8886` que aparece na documentação da Twilio.
3. **Cada celular que vai receber** manda esse `join <código>` por WhatsApp para o número do sandbox,
   uma vez. É o opt-in exigido pelo WhatsApp, não uma restrição da Twilio.
4. No `.env`:

```ini
MENSAGERIA_WHATSAPP=twilio
TWILIO_ACCOUNT_SID=AC...                     # console, painel inicial
TWILIO_AUTH_TOKEN=...                        # idem
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX   # o número do SEU sandbox
```

#### Texto livre × Content Template

O WhatsApp só aceita texto livre (`Body`) **dentro da janela de 24 h** aberta por uma mensagem do
destinatário. Fora dela, exige template aprovado — na API, `ContentSid` + `ContentVariables`.

**Em conta trial, `Body` nunca funciona**, nem com a janela aberta: a Twilio responde
`400 [21654] ContentSid Required`. Verificado em 30/08/2026, com o `join` confirmado 69 s antes do envio.
A trial só envia pelos Content Templates que a própria Twilio provisiona, e os `HX...` deles **só aparecem
no console** — a Content API que os listaria responde `401 [20003] not available on a Trial account`.

Para pegar o SID: console → **Messaging → Try it out → Send a WhatsApp message**, escolha um template e
envie. A tela mostra a requisição de API equivalente, com o `ContentSid`. Então:

```ini
TWILIO_CONTENT_SIDS={"convocacao_vaga":{"sid":"HX...","variaveis":["{crianca}","{unidade}","{prazo}"]}}
```

Cada item de `variaveis` é um molde preenchido com os `dados` do pedido, na ordem dos `{{1}}`, `{{2}}`… do
template. Sem entrada para um template, o envio usa texto livre — que é o caminho normal dentro da janela,
com conta paga. Os dois convivem de propósito.

> **Os templates da trial têm texto fixo.** Verificado em 30/08/2026: os três provisionados nesta conta
> entregam *"Reminder: Appt Tue Oct 29, 3:00 PM…"*, *"Thank you! Order #ORD87254 confirmed…"* e
> *"Reminder: Your event starts tonight at 7 PM…"* — **sem nenhum placeholder**, então `ContentVariables`
> é ignorado. Dá para provar que o canal funciona, não para entregar o texto da convocação.
>
> Por isso o `.env` de demonstração mapeia **só o template `teste`**: as mensagens reais ficam em texto
> livre e falham com `21654` na trial, em vez de entregar "Your event starts tonight" a uma família. Em
> conta paga com templates próprios aprovados, as duas coisas passam a funcionar sem tocar no código.

Outras restrições da trial: destinatário precisa estar entre os **até 5 números verificados** e a franquia
é de **100 mensagens WhatsApp** (Free units tracker no console).

**Produção**: número WhatsApp Business aprovado, templates próprios aprovados pela Meta, e o mesmo
`TWILIO_CONTENT_SIDS` apontando para eles — configuração, não código.

### E-mail — Resend

1. Conta em [resend.com](https://resend.com), **Add API Key**.
2. No `.env`:

```ini
MENSAGERIA_EMAIL=resend
RESEND_API_KEY=re_...
RESEND_FROM=Inscricao Creche <onboarding@resend.dev>
```

Sem domínio verificado, o remetente de teste `onboarding@resend.dev` **só entrega no e-mail dono da conta
Resend**. Para enviar a qualquer destinatário, verifique um domínio e troque `RESEND_FROM`.

### E-mail — SMTP (alternativa)

Rota de fuga sem cadastro em serviço novo. No Gmail exige **senha de app** (com verificação em duas
etapas ligada), não a senha da conta:

```ini
MENSAGERIA_EMAIL=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=voce@gmail.com
SMTP_PASSWORD=<senha de app, 16 caracteres>
SMTP_FROM=Inscricao Creche <voce@gmail.com>
```

### SMS — Twilio

Mesmo endpoint do WhatsApp, sem o prefixo `whatsapp:`, mas **exige número comprado** — o sandbox é só
WhatsApp. Sem `TWILIO_SMS_FROM`, o canal fica `pendente`.

## Chamar do backend

```python
from app.integracoes import mensageria

mensageria.enviar("whatsapp", "21 99999-8888", "convocacao_vaga", {...},
                  referencia="convocacao:1234")

# avisa em todos os canais cadastrados; a chave de idempotência sai da referência
mensageria.enviar_para_contatos(pre_cadastro.contatos, "convocacao_vaga", {...},
                                referencia="convocacao:1234", ator="polo")
```

Nunca levanta exceção. `MENSAGERIA_ATIVO=0` faz o backend nem chamar o serviço — use na carga da base e
no `make seed`, onde ninguém deve ser avisado de nada.

## Limites conhecidos

- **Idempotência é memória do processo.** Reiniciar o container ou rodar duas réplicas zera a garantia.
  Produção: Redis com a mesma interface (`app/idempotencia.py` tem duas funções a reimplementar).
- **Sem confirmação de entrega.** `enviado` = aceito pelo provedor. Saber se chegou ao aparelho exige
  `StatusCallback` (Twilio) / webhook (Resend), que esta fase não tem.
- **Envio é síncrono.** O lote paraleliza com teto de concorrência, mas não há fila. Para as ~19 mil
  convocações do `make seed`, o caminho é fila com retentativa persistente.
