-- Pré-cadastro da família (jul–ago): instrumento de medição de demanda + contatos múltiplos.
-- Aplicado pelo Postgres na primeira subida; em banco já existente: docker compose exec -T db psql -U creche -d creche < db/init/002_pre_cadastro.sql

CREATE TABLE IF NOT EXISTS pre_cadastro (
    id                BIGSERIAL PRIMARY KEY,
    protocolo         VARCHAR(20) UNIQUE NOT NULL,
    cpf_hash          VARCHAR(64) NOT NULL,          -- sha256(cpf + sal): o CPF em claro nunca é gravado
    nome_responsavel  TEXT NOT NULL,
    nome_crianca      TEXT,
    nascimento_anomes VARCHAR(7) NOT NULL,           -- AAAA-MM (mesma generalização da base da SME)
    grupamento        VARCHAR(32) NOT NULL,
    horario           VARCHAR(16) NOT NULL,
    cep               VARCHAR(8) NOT NULL,
    cep_alternativo   VARCHAR(8),
    bairro            TEXT,
    lat               DOUBLE PRECISION,
    lon               DOUBLE PRECISION,
    regua_ano         INTEGER NOT NULL,              -- régua usada para a pontuação estimada
    respostas         JSONB NOT NULL,                -- {ich_perg_id: bool}
    pontuacao         INTEGER NOT NULL,
    escolhas          JSONB NOT NULL,                -- [{"ordem": 1, "codigo": "0734802"}, …] até 5
    consentimento_em  TIMESTAMPTZ NOT NULL,
    criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pre_cadastro_cpf ON pre_cadastro(cpf_hash);
CREATE INDEX IF NOT EXISTS ix_pre_cadastro_bairro ON pre_cadastro(bairro);

-- Mais de uma pessoa e mais de um canal por família: é o que evita o gargalo da convocação.
CREATE TABLE IF NOT EXISTS contato (
    id               BIGSERIAL PRIMARY KEY,
    pre_cadastro_id  BIGINT NOT NULL REFERENCES pre_cadastro(id),
    nome             TEXT NOT NULL,
    parentesco       VARCHAR(16),
    canal            VARCHAR(16) NOT NULL CHECK (canal IN ('celular','whatsapp','email')),
    valor            TEXT NOT NULL,
    principal        BOOLEAN NOT NULL DEFAULT FALSE,
    verificado_em    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_contato_pre_cadastro ON contato(pre_cadastro_id);
