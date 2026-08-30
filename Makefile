PY := .venv/bin/python
PIP := .venv/bin/pip

.PHONY: venv audit load api test up down logs db migrate

venv:            ## cria o venv e instala o backend em modo editável
	python3 -m venv .venv && $(PIP) install -e "backend[dev]"

audit:           ## auditoria das bases da SME (DuckDB) -> out/
	cd backend && ../$(PY) -m app.etl.audit

load:            ## carrega o Postgres a partir de data/ (idempotente)
	cd backend && ../$(PY) -m app.etl.load

api:             ## API em modo dev
	cd backend && ../$(PY) -m uvicorn app.main:app --reload --port 8000

test:            ## testes do motor
	cd backend && ../$(PY) -m pytest -q

db:              ## só o Postgres, para desenvolvimento local
	docker compose up -d db

migrate:         ## aplica db/init/*.sql em um banco que já existe (o init só roda na 1ª subida)
	for f in db/init/*.sql; do docker compose exec -T db psql -q -v ON_ERROR_STOP=0 -U $${POSTGRES_USER:-creche} -d $${POSTGRES_DB:-creche} < $$f >/dev/null 2>&1 || true; done; echo "migrations aplicadas"

up:              ## tudo em containers
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=100
