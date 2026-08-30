# frontend — Inscrição Creche · SME-Rio

Painel da CRE/polo e classificação por criança. React 18 + Vite + TypeScript, sem framework de UI:
o design system em `src/design-system/` espelha os tokens do `matricula.rio` (ver `spec/11-baseline-tecnico.md`).

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
src/design-system/   tokens.css + componentes (AppHeader, Button, Card, StatTile, StatusPill, DataTable…)
src/api/             client.ts (fetch + tipos de todas as rotas do backend)
src/pages/           Painel, Convocações, Classificação, Unidades
```
