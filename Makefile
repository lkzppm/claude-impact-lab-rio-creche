PY := .venv/bin/python
PIP := .venv/bin/pip

.PHONY: venv audit load seed api mensageria lint test test-integracao test-mensageria ci up down logs db migrate

venv:            ## cria o venv e instala o backend em modo editável
	python3 -m venv .venv && $(PIP) install -e "backend[dev]"

audit:           ## auditoria das bases da SME (DuckDB) -> out/
	cd backend && ../$(PY) -m app.etl.audit

load:            ## carrega o Postgres a partir de data/ (idempotente)
	cd backend && ../$(PY) -m app.etl.load

seed:            ## dados de demonstração: classifica, convoca e simula 5 dias de convocação (SEED_ARGS="--limpar --todos")
	cd backend && ../$(PY) -m app.etl.seed_demo $(SEED_ARGS)

api:             ## API em modo dev
	cd backend && ../$(PY) -m uvicorn app.main:app --reload --port 8000

mensageria:      ## serviço de mensageria em modo dev (porta 8100)
	cd mensageria && ../$(PY) -m uvicorn app.main:app --reload --port 8100

lint:            ## ruff no backend e na mensageria (mesma regra do CI, ruff.toml na raiz)
	$(PY:python=ruff) check backend/app backend/tests mensageria/app mensageria/tests

test:            ## testes do motor
	cd backend && ../$(PY) -m pytest -q

test-integracao: ## teste ponta a ponta contra um Postgres de TESTE (cria creche_test no container db e o trunca)
	docker compose exec -T db psql -U creche -d postgres -q -c "DROP DATABASE IF EXISTS creche_test" -c "CREATE DATABASE creche_test"
	for f in db/init/*.sql; do docker compose exec -T db psql -U creche -d creche_test -q -v ON_ERROR_STOP=1 < $$f; done
	cd backend && TEST_DATABASE_URL=postgresql+psycopg://creche:creche@localhost:5432/creche_test ../$(PY) -m pytest -q

ci:              ## o que o GitHub Actions roda, localmente: lint + testes + typecheck/build do frontend
	$(MAKE) lint test test-mensageria
	cd frontend && npm run build

test-mensageria: ## testes do serviço de mensageria (não tocam a rede: tudo no provedor mock)
	cd mensageria && ../$(PY) -m pytest -q

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
