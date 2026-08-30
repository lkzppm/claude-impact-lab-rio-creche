-- Esquema do baseline (spec/11-baseline-tecnico.md). Aplicado pelo Postgres na primeira subida.
-- Espelhado em backend/app/models.py — alterar os dois juntos.

CREATE TABLE processo (
    ano        INTEGER PRIMARY KEY,
    prm_id     INTEGER NOT NULL,
    descricao  TEXT
);

CREATE TABLE pergunta (
    ano                 INTEGER NOT NULL REFERENCES processo(ano),
    ich_perg_id         INTEGER NOT NULL,
    perg_id             INTEGER,
    texto               TEXT NOT NULL,
    pontuacao           INTEGER NOT NULL DEFAULT 0,
    criterio_desempate  BOOLEAN NOT NULL DEFAULT FALSE,
    ordem               INTEGER,
    PRIMARY KEY (ano, ich_perg_id)
);

CREATE TABLE unidade (
    codigo      VARCHAR(32) PRIMARY KEY,
    nome        TEXT,
    tipo        TEXT,
    logradouro  TEXT,
    numero      TEXT,
    bairro      TEXT,
    cep         VARCHAR(16),
    cre         VARCHAR(16),
    microarea   TEXT,
    polo        TEXT,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION
);

CREATE TABLE inscricao (
    id                 BIGSERIAL PRIMARY KEY,
    ano                INTEGER NOT NULL REFERENCES processo(ano),
    prm_id             INTEGER NOT NULL,
    plm_id             INTEGER NOT NULL,
    ipl_id             INTEGER NOT NULL,
    aluno_anon         VARCHAR(32),
    responsavel_anon   VARCHAR(32),
    nascimento_anomes  VARCHAR(7),
    sexo               VARCHAR(1),
    cep                VARCHAR(16),
    bairro             TEXT,
    data_criacao       TIMESTAMP,
    pontuacao          INTEGER NOT NULL DEFAULT 0,   -- calculada: Σ pontos das respostas 'Sim' na régua do ano
    CONSTRAINT uq_inscricao_chave_sme UNIQUE (prm_id, plm_id, ipl_id)
);
CREATE INDEX ix_inscricao_ano ON inscricao(ano);
CREATE INDEX ix_inscricao_aluno ON inscricao(aluno_anon);

CREATE TABLE opcao (
    id               BIGSERIAL PRIMARY KEY,
    inscricao_id     BIGINT NOT NULL REFERENCES inscricao(id),
    ordem            INTEGER NOT NULL,
    unidade_codigo   VARCHAR(32) NOT NULL REFERENCES unidade(codigo),
    grupamento       VARCHAR(32) NOT NULL,
    horario          VARCHAR(16) NOT NULL,
    situacao_origem  TEXT                            -- desfecho real da SME, para comparação
);
CREATE INDEX ix_opcao_inscricao_id ON opcao(inscricao_id);
CREATE INDEX ix_opcao_unidade_codigo ON opcao(unidade_codigo);

CREATE TABLE resposta (
    inscricao_id  BIGINT NOT NULL REFERENCES inscricao(id),
    ich_perg_id   INTEGER NOT NULL,
    resposta      BOOLEAN NOT NULL,
    confirmado    BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (inscricao_id, ich_perg_id)
);

CREATE TABLE capacidade (
    ano             INTEGER NOT NULL REFERENCES processo(ano),
    unidade_codigo  VARCHAR(32) NOT NULL REFERENCES unidade(codigo),
    grupamento      VARCHAR(32) NOT NULL,
    horario         VARCHAR(16) NOT NULL,
    vagas           INTEGER NOT NULL,
    fonte           VARCHAR(32) NOT NULL,            -- estimada_confirmados | informada
    PRIMARY KEY (ano, unidade_codigo, grupamento, horario)
);

CREATE TABLE rodada (
    id            BIGSERIAL PRIMARY KEY,
    ano           INTEGER NOT NULL REFERENCES processo(ano),
    tipo          VARCHAR(16) NOT NULL,              -- inicial | rematch
    criada_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    parametros    JSONB,
    hash_entrada  VARCHAR(64),
    resumo        JSONB
);

CREATE TABLE alocacao (
    id              BIGSERIAL PRIMARY KEY,
    rodada_id       BIGINT NOT NULL REFERENCES rodada(id),
    inscricao_id    BIGINT NOT NULL REFERENCES inscricao(id),
    opcao_id        BIGINT REFERENCES opcao(id),
    unidade_codigo  VARCHAR(32) REFERENCES unidade(codigo),
    grupamento      VARCHAR(32) NOT NULL,
    horario         VARCHAR(16) NOT NULL,
    status          VARCHAR(24) NOT NULL CHECK (status IN ('alocada','lista_espera','sem_opcao_viavel')),
    tipo            VARCHAR(16) CHECK (tipo IN ('presa','selecionavel')),   -- NULL se sem_opcao_viavel
    posicao_fila    INTEGER,
    pontuacao       INTEGER NOT NULL DEFAULT 0,
    motivo          JSONB,                           -- log de decisão por criança
    vaga_liberada   BOOLEAN NOT NULL DEFAULT FALSE   -- convocação recusada/expirada: vaga volta ao pool
);
CREATE INDEX ix_alocacao_rodada_id ON alocacao(rodada_id);
CREATE INDEX ix_alocacao_inscricao_id ON alocacao(inscricao_id);
CREATE INDEX ix_alocacao_unidade ON alocacao(unidade_codigo);

CREATE TABLE convocacao (
    id              BIGSERIAL PRIMARY KEY,
    alocacao_id     BIGINT NOT NULL REFERENCES alocacao(id),
    inscricao_id    BIGINT NOT NULL REFERENCES inscricao(id),
    unidade_codigo  VARCHAR(32) NOT NULL REFERENCES unidade(codigo),
    grupamento      VARCHAR(32) NOT NULL,
    horario         VARCHAR(16) NOT NULL,
    status          VARCHAR(24) NOT NULL CHECK (status IN
                        ('selecionada','contato_tentado','contato_confirmado','confirmada','recusada','expirada','liberada')),
    prazo_fim       TIMESTAMPTZ,
    criada_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_convocacao_status ON convocacao(status);
CREATE INDEX ix_convocacao_unidade ON convocacao(unidade_codigo);
CREATE INDEX ix_convocacao_inscricao ON convocacao(inscricao_id);

-- Log de eventos: o dado que hoje não existe (gap nº 1 do briefing). APPEND-ONLY.
CREATE TABLE evento (
    id              BIGSERIAL PRIMARY KEY,
    ocorrido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    tipo            VARCHAR(32) NOT NULL,
    convocacao_id   BIGINT REFERENCES convocacao(id),
    inscricao_id    BIGINT REFERENCES inscricao(id),
    unidade_codigo  VARCHAR(32) REFERENCES unidade(codigo),
    ator            TEXT,
    payload         JSONB
);
CREATE INDEX ix_evento_convocacao_id ON evento(convocacao_id);
CREATE INDEX ix_evento_ocorrido_em ON evento(ocorrido_em);

CREATE OR REPLACE FUNCTION evento_somente_insercao() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'evento é append-only: % não permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evento_append_only
    BEFORE UPDATE OR DELETE ON evento
    FOR EACH ROW EXECUTE FUNCTION evento_somente_insercao();

-- Comprovação de critérios via bases oficiais (Conecta gov.br / RMI / Receita) — mock nesta fase.
-- Só armazena o resultado: a pontuação segue = declarado × régua até a SME validar a regra.
CREATE TABLE comprovacao (
    id             BIGSERIAL PRIMARY KEY,
    inscricao_id   BIGINT NOT NULL REFERENCES inscricao(id),
    criterio       TEXT NOT NULL,                    -- cadunico | bolsa_familia | cpf | educacao_especial | …
    fonte          TEXT NOT NULL,                    -- conecta_cadunico | conecta_bolsa_familia | receita_cpf | rmi | manual
    resultado      VARCHAR(16) NOT NULL CHECK (resultado IN ('confirmado','nao_encontrado','erro','pendente')),
    protocolo      TEXT,
    consultado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload        JSONB
);
CREATE INDEX ix_comprovacao_inscricao_id ON comprovacao(inscricao_id);
