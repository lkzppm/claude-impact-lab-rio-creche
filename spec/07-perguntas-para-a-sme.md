# 07 — Perguntas para a SME

> As respostas mudam materialmente o projeto. Perguntar cedo — na abertura, não às 15h.
> Marcadas com ✅ as que os dados e o briefing **já responderam** — não gaste o tempo da SME com elas.

## A pergunta nº 1

> **De 2022 em diante, `confirmado = 'Sim'` cai para ~8% e vale igual para quem respondeu `Sim` e para quem
> respondeu `Nao`. Isso é perda real de pontuação por não comprovação, ou a validação passou a ser feita no
> Registro Municipal Integrado sem voltar para essa coluna?**

Tudo muda conforme a resposta: se é perda real, ~93% de quem declara critério perde a pontuação e esse é o
maior problema do case inteiro. Se é falha de registro, quem tentar "medir a perda de comprovação" está
otimizando sobre um artefato. Contexto e evidência em
[09 §4](09-achados-dos-dados.md#4-a-comprovação-de-critérios-praticamente-não-é-registrada).

Perguntas de apoio, na mesma linha:

- Existe **carimbo de tempo de mudança de status** em algum lugar (log, auditoria, backup do ICH)? Sem ele,
  nenhuma métrica de duração de convocação é calculável.
- Qual é a **capacidade ofertada por unidade, grupamento e turno** em cada processo? A base traz ocupação,
  não oferta.
- Por que quase metade das inscrições de 2025 usou **uma única opção** das cinco? É desistência no
  formulário, desconhecimento, ou escolha deliberada?

## As que mais mudam o projeto

1. Existe hoje uma **base única de capacidade por unidade e turma**, ou o número vem de cada creche?
2. A criança pode mesmo ser **classificada em mais de uma das 5 opções simultaneamente**? Quantas, em média?
   *(o deck confirma que sim — "ofertando até 5 vagas para o mesmo CPF" — mas na base só 0,25% das crianças
   terminam com mais de uma opção `Confirmado`, então o congelamento acontece no estado `Selecionado`, que a
   base não registra)*
3. Qual a **profundidade média da cascata** de convocação e quantos dias letivos ela consome?
4. Quantas vagas ficam **ociosas em março** e quantas crianças seguem na fila nesse mesmo momento?
5. Qual o **% de contatos inválidos** na convocação?
6. ✅ ~~Que **campos** vêm na base de inscrição do case?~~ Respondido pelo dicionário de dados —
   ver [03](03-dados-disponiveis.md). Georreferenciamento existe **do lado da unidade** (lat/long em
   `Unidades_Unificadas_com_Localizacao.xlsx`); do lado da família, só bairro e CEP. Pontuação final não vem
   pronta: é preciso reconstruí-la juntando QueryB × QueryC.
7. A SME tem acesso a **SINASC / CadÚnico georreferenciado**, ou isso passa por Saúde e Assistência Social?
8. Dá para integrar com o **Pref Rio** da IplanRio, ou o canal teria que ser novo?

---

## Perguntas de enquadramento

1. Qual métrica a SME quer mover: vagas ocupadas, taxa de comprovação, tempo de espera, ou satisfação?
2. ✅ ~~Que dados vêm no case?~~ Ver [03](03-dados-disponiveis.md). **Capacidade por unidade continua em
   aberto** — há ocupação, não oferta.
3. A lista de espera é digital e centralizada hoje, ou ainda é por unidade?
4. Qual a taxa de perda de pontuação por não comprovação? (se ninguém souber, isso já é um achado)
5. Há integração possível com o agente Pref Rio / IplanRio?
6. Quantas vagas ficam ociosas por não confirmação presencial no fim do processo?
7. Quem é o dono do produto do lado da prefeitura depois do hackathon?

---
