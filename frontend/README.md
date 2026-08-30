# frontend — Inscrição Creche · SME-Rio

Três painéis sobre a mesma API — Família (`/familia`, celular), CRE/polo (`/cre`) e Nível Central (`/sme`).
React 18 + Vite + TypeScript, sem framework de UI: o design system em `src/design-system/` espelha os tokens
do `matricula.rio` (ver `spec/11-baseline-tecnico.md`).

## Rodar

```bash
cp .env.example .env      # VITE_API_URL aponta para o backend (padrão http://localhost:8000/api/v1)
npm install
npm run dev               # http://localhost:5173
npm run build             # typecheck + build em dist/
```

## Docker

```bash
docker build --build-arg VITE_API_URL=http://localhost:8000/api/v1 -t creche-frontend .
docker run -p 8080:80 creche-frontend
```

## Estrutura

```
src/design-system/   tokens.css + componentes (AppHeader com CRE e "Registrando como", Button, Card, StatTile clicável,
                     StatusPill, DataTable, ConfirmDialog com canal, PrazoBar, rótulos de evento/canal…)
src/areas/           AreaContext: área atual, CRE escolhida e quem registra (localStorage)
src/api/             client.ts + types.ts (todas as rotas do backend)
src/pages/           Família (código → inscrição, responder à reserva)
                     CRE: Painel "Para hoje" + fila de trabalho, Convocações por fila, ficha da convocação
                          (relógio, canal, convocar próximo da fila), Várias reservas, Unidade (fila de espera,
                          capacidade informada), ficha da inscrição
                     SME: Rede por CRE, Classificação (rodadas e comparação 1 × 3 reservas), Inscrições, Unidades, Régua
```

## Painel da CRE — como foi desenhado

- **Fila de trabalho, não relatório.** O painel abre em "Para hoje": vencidas, vencem em 24 h, sem aviso e
  crianças com várias reservas — cada número é um link para a lista já filtrada, ordenada da mais urgente para a
  menos, com a coluna "Próxima ação" dizendo o que fazer.
- **Primeiro acesso** pede a CRE em 11 cartões; fica salva no navegador. "Registrando como" na barra azul vira o
  `ator` de cada evento.
- **Ficha da convocação**: relógio de 0–72 h, canal do contato (WhatsApp, ligação, SMS, e-mail, visita), histórico
  em português. Vaga recusada ou vencida mostra **quem é o próximo da fila** e o botão para convocá-lo.
- **Unidade**: fila de espera por grupamento/turno na ordem do motor; capacidade "estimada" pode ser corrigida em
  linha (`fonte = informada`).
- **Expirar em lote** as vencidas do recorte, com confirmação. "Imprimir lista" para quem trabalha com a folha de
  ligações (`@media print`).
