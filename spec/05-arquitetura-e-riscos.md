# 05 — Arquitetura, restrições e armadilhas

## Arquitetura recomendada (e o argumento que vende)

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

## Se der para escolher só um recorte

**Convocação com DA + agente de WhatsApp.** Razões:
1. É o único dos três em que dá para **provar o ganho na hora**, com simulação: rodar o processo atual vs. DA sobre dados sintéticos e mostrar `vagas ociosas × dias` despencando.
2. É o mais **legalmente seguro** — preserva a pontuação da resolução intacta.
3. É o que **fala direto com a ordem judicial** de zerar a fila.
4. Tem **precedente municipal de adoção** (Pref Rio) e **benchmark nacional de resultado** (São Paulo zerou a fila).

**Demo que convence:** um contador na tela. "Processo atual: 340 vagas ociosas por 18 dias = 6.120 criança-dias perdidos. Com alocação coordenada: 12 vagas ociosas por 2 dias = 24." Um número, uma tela, sem jargão.

---

## Armadilhas a evitar

- ❌ Propor mudar a **tabela de pontuação** — é norma (Res. SME 542/2025), não código. Mata o projeto na banca.
- ❌ LLM decidindo alocação — indefensável perante LGPD art. 14, ECA e controle externo.
- ❌ Propor **app novo** — o público-alvo é de baixa conectividade. WhatsApp, 1746, Carioca Digital e Rioeduca já existem.
- ❌ Otimizar alocação sobre **capacidade não confiável** — sem fonte única de verdade da vaga, o algoritmo erra com precisão.
- ❌ Ignorar o **Pref Rio** e o **EOL de São Paulo** no pitch — passa a impressão de que o time não pesquisou.
- ❌ Prometer integração que a SME não consegue entregar — o prêmio é a **doação do projeto à cidade**; o que não roda, não vale.

---

## Restrições que a banca provavelmente vai testar

- **LGPD art. 14** — dados de crianças e adolescentes exigem **melhor interesse** da criança e, em regra, consentimento específico de ao menos um dos pais/responsável. Setor público usa outras bases legais (execução de política pública), mas o crivo é mais rígido. ANPD está em ciclo de fiscalização do **ECA Digital** em 2026.
- **Dados sensíveis embutidos no próprio processo:** violência doméstica, deficiência, doença crônica, dependência química, familiar preso, condição de refugiado. Qualquer solução que processe a pontuação está tratando **dado sensível de criança em situação de vulnerabilidade**. Minimização, retenção curta, log de acesso e não-inferência são obrigatórios, não enfeite.
- **Equidade algorítmica:** um sistema que "otimiza alocação" pode reproduzir desigualdade territorial. Toda pontuação/ranking precisa ser **explicável em linguagem de responsável**, não só auditável por engenheiro.
- **Não substituir a norma:** a pontuação é definida por **resolução da SME**. IA que "decide" quem entra é inviável juridicamente. IA que **ajuda a família a exercer o direito que já tem** e que **ajuda a SME a enxergar a demanda** é viável.
- **Acessibilidade e exclusão digital:** parte do público-alvo é justamente quem tem menos acesso. WhatsApp > app novo. Voz e texto simples > formulário.

---
