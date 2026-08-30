-- Log de acesso do assistente (backend/app/agente). Requisito de LGPD art. 14 / spec/05: registrar quem
-- consultou o quê e quando. Uma linha por turno de conversa. APPEND-ONLY, como `evento`.
-- Espelhado em backend/app/models.py (ConsultaAgente) — alterar os dois juntos.
--
-- Guarda: quando, área (cre|sme), CRE e ator declarados, modelo, hash SHA-256 da pergunta (não o texto),
-- tamanho da pergunta, ferramentas chamadas com argumentos (= quais dados foram lidos), tokens, duração.
-- Não guarda: texto da pergunta, texto da resposta, conteúdo devolvido pelas ferramentas.

CREATE TABLE consulta_agente (
    id              BIGSERIAL PRIMARY KEY,
    ocorrido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    area            VARCHAR(8) NOT NULL CHECK (area IN ('cre','sme')),
    cre             VARCHAR(16),
    ator            TEXT,
    modelo          TEXT NOT NULL,
    pergunta_hash   VARCHAR(64) NOT NULL,            -- sha256 do texto da última pergunta do usuário
    pergunta_chars  INTEGER,
    ferramentas     JSONB,                           -- [{nome, argumentos, erro?}]
    tokens_entrada  INTEGER,
    tokens_saida    INTEGER,
    duracao_ms      INTEGER,
    resultado       VARCHAR(16) NOT NULL DEFAULT 'ok' CHECK (resultado IN ('ok','erro','recusa'))
);
CREATE INDEX ix_consulta_agente_ocorrido_em ON consulta_agente(ocorrido_em);

CREATE OR REPLACE FUNCTION consulta_agente_somente_insercao() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'consulta_agente é append-only: % não permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consulta_agente_append_only
    BEFORE UPDATE OR DELETE ON consulta_agente
    FOR EACH ROW EXECUTE FUNCTION consulta_agente_somente_insercao();
