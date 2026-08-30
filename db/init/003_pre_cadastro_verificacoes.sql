-- Resultado das verificações automáticas (Conecta/RMI) feitas no pré-cadastro, pelo CPF.
ALTER TABLE pre_cadastro ADD COLUMN IF NOT EXISTS verificacoes JSONB;
