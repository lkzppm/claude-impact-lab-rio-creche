"""Modelo de dados — espelho exato de db/init/001_schema.sql (spec/11-baseline-tecnico.md)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# JSONB no Postgres, JSON genérico em outros dialetos (testes)
Json = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class Processo(Base):
    __tablename__ = "processo"
    ano: Mapped[int] = mapped_column(Integer, primary_key=True)
    prm_id: Mapped[int] = mapped_column(Integer, nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)


class Pergunta(Base):
    __tablename__ = "pergunta"
    ano: Mapped[int] = mapped_column(Integer, ForeignKey("processo.ano"), primary_key=True)
    ich_perg_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    perg_id: Mapped[int | None] = mapped_column(Integer)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    pontuacao: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    criterio_desempate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ordem: Mapped[int | None] = mapped_column(Integer)


class Unidade(Base):
    __tablename__ = "unidade"
    codigo: Mapped[str] = mapped_column(String(32), primary_key=True)
    nome: Mapped[str | None] = mapped_column(Text)
    tipo: Mapped[str | None] = mapped_column(Text)
    logradouro: Mapped[str | None] = mapped_column(Text)
    numero: Mapped[str | None] = mapped_column(Text)
    bairro: Mapped[str | None] = mapped_column(Text)
    cep: Mapped[str | None] = mapped_column(String(16))
    cre: Mapped[str | None] = mapped_column(String(16))
    microarea: Mapped[str | None] = mapped_column(Text)
    polo: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)


class Inscricao(Base):
    __tablename__ = "inscricao"
    __table_args__ = (UniqueConstraint("prm_id", "plm_id", "ipl_id", name="uq_inscricao_chave_sme"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ano: Mapped[int] = mapped_column(Integer, ForeignKey("processo.ano"), nullable=False, index=True)
    prm_id: Mapped[int] = mapped_column(Integer, nullable=False)
    plm_id: Mapped[int] = mapped_column(Integer, nullable=False)
    ipl_id: Mapped[int] = mapped_column(Integer, nullable=False)
    aluno_anon: Mapped[str | None] = mapped_column(String(32))
    responsavel_anon: Mapped[str | None] = mapped_column(String(32))
    nascimento_anomes: Mapped[str | None] = mapped_column(String(7))
    sexo: Mapped[str | None] = mapped_column(String(1))
    cep: Mapped[str | None] = mapped_column(String(16))
    bairro: Mapped[str | None] = mapped_column(Text)
    data_criacao: Mapped[datetime | None] = mapped_column(DateTime)
    pontuacao: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    opcoes: Mapped[list[Opcao]] = relationship(back_populates="inscricao", order_by="Opcao.ordem")
    respostas: Mapped[list[Resposta]] = relationship(back_populates="inscricao")


class Opcao(Base):
    __tablename__ = "opcao"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    inscricao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("inscricao.id"), nullable=False, index=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    unidade_codigo: Mapped[str] = mapped_column(String(32), ForeignKey("unidade.codigo"), nullable=False, index=True)
    grupamento: Mapped[str] = mapped_column(String(32), nullable=False)
    horario: Mapped[str] = mapped_column(String(16), nullable=False)
    situacao_origem: Mapped[str | None] = mapped_column(Text)

    inscricao: Mapped[Inscricao] = relationship(back_populates="opcoes")


class Resposta(Base):
    __tablename__ = "resposta"
    inscricao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("inscricao.id"), primary_key=True)
    ich_perg_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    resposta: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confirmado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    inscricao: Mapped[Inscricao] = relationship(back_populates="respostas")


class Capacidade(Base):
    __tablename__ = "capacidade"
    ano: Mapped[int] = mapped_column(Integer, ForeignKey("processo.ano"), primary_key=True)
    unidade_codigo: Mapped[str] = mapped_column(String(32), ForeignKey("unidade.codigo"), primary_key=True)
    grupamento: Mapped[str] = mapped_column(String(32), primary_key=True)
    horario: Mapped[str] = mapped_column(String(16), primary_key=True)
    vagas: Mapped[int] = mapped_column(Integer, nullable=False)
    fonte: Mapped[str] = mapped_column(String(32), nullable=False)  # estimada_confirmados | informada


class Rodada(Base):
    __tablename__ = "rodada"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ano: Mapped[int] = mapped_column(Integer, ForeignKey("processo.ano"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(16), nullable=False)  # inicial | rematch
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    parametros: Mapped[dict[str, Any] | None] = mapped_column(Json)
    hash_entrada: Mapped[str | None] = mapped_column(String(64))
    resumo: Mapped[dict[str, Any] | None] = mapped_column(Json)

    alocacoes: Mapped[list[Alocacao]] = relationship(back_populates="rodada")


class Alocacao(Base):
    __tablename__ = "alocacao"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    rodada_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("rodada.id"), nullable=False, index=True)
    inscricao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("inscricao.id"), nullable=False)
    opcao_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("opcao.id"))
    unidade_codigo: Mapped[str | None] = mapped_column(String(32), ForeignKey("unidade.codigo"))
    grupamento: Mapped[str] = mapped_column(String(32), nullable=False)
    horario: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)  # alocada | lista_espera | sem_opcao_viavel
    tipo: Mapped[str | None] = mapped_column(String(16))              # presa | selecionavel (NULL se sem_opcao_viavel)
    posicao_fila: Mapped[int | None] = mapped_column(Integer)
    pontuacao: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    motivo: Mapped[dict[str, Any] | None] = mapped_column(Json)
    # True quando a convocação derivada foi recusada/expirou: a vaga voltou ao pool para rematch
    vaga_liberada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    rodada: Mapped[Rodada] = relationship(back_populates="alocacoes")


class Convocacao(Base):
    __tablename__ = "convocacao"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    alocacao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("alocacao.id"), nullable=False)
    inscricao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("inscricao.id"), nullable=False)
    unidade_codigo: Mapped[str] = mapped_column(String(32), ForeignKey("unidade.codigo"), nullable=False)
    grupamento: Mapped[str] = mapped_column(String(32), nullable=False)
    horario: Mapped[str] = mapped_column(String(16), nullable=False)
    # selecionada | contato_tentado | contato_confirmado | confirmada | recusada | expirada | liberada
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    prazo_fim: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    atualizada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    eventos: Mapped[list[Evento]] = relationship(back_populates="convocacao", order_by="Evento.ocorrido_em")


class Evento(Base):
    """Log append-only: o banco proíbe UPDATE/DELETE (trigger em 001_schema.sql)."""
    __tablename__ = "evento"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    tipo: Mapped[str] = mapped_column(String(32), nullable=False)
    convocacao_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("convocacao.id"), index=True)
    inscricao_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("inscricao.id"))
    unidade_codigo: Mapped[str | None] = mapped_column(String(32), ForeignKey("unidade.codigo"))
    ator: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any] | None] = mapped_column(Json)

    convocacao: Mapped[Convocacao | None] = relationship(back_populates="eventos")


class Comprovacao(Base):
    """Resultado de uma consulta a base oficial (Conecta gov.br, RMI, Receita) ou registro manual.
    Nesta fase só armazena: a pontuação continua = declarado × régua."""
    __tablename__ = "comprovacao"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    inscricao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("inscricao.id"), nullable=False, index=True)
    criterio: Mapped[str] = mapped_column(Text, nullable=False)     # cadunico | bolsa_familia | cpf | educacao_especial | …
    fonte: Mapped[str] = mapped_column(Text, nullable=False)        # conecta_cadunico | conecta_bolsa_familia | receita_cpf | rmi | manual
    resultado: Mapped[str] = mapped_column(String(16), nullable=False)  # confirmado | nao_encontrado | erro | pendente
    protocolo: Mapped[str | None] = mapped_column(Text)
    consultado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    payload: Mapped[dict[str, Any] | None] = mapped_column(Json)


class ConsultaAgente(Base):
    """Log de acesso do assistente (app/agente) — uma linha por turno de conversa. APPEND-ONLY: o banco
    proíbe UPDATE/DELETE (trigger em db/init/002_agente.sql), como em `evento`.

    O que É guardado: quando, área (cre|sme), CRE e ator declarados, modelo que respondeu, hash SHA-256 da
    pergunta (permite provar que uma pergunta foi feita sem guardar o texto), tamanho da pergunta, a lista de
    ferramentas chamadas com os argumentos (é isso que diz QUAIS dados foram lidos: id de convocação, código
    de inscrição, filtros, SQL da consulta livre), tokens e duração.

    O que NÃO é guardado: o texto da pergunta, o texto da resposta e o conteúdo que as ferramentas devolveram
    (minimização — LGPD art. 6º, III, e art. 14). O log responde "quem consultou o quê e quando", não "o que
    foi dito".
    """
    __tablename__ = "consulta_agente"
    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    area: Mapped[str] = mapped_column(String(8), nullable=False)          # cre | sme
    cre: Mapped[str | None] = mapped_column(String(16))
    ator: Mapped[str | None] = mapped_column(Text)
    modelo: Mapped[str] = mapped_column(Text, nullable=False)
    pergunta_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    pergunta_chars: Mapped[int | None] = mapped_column(Integer)
    ferramentas: Mapped[list[Any] | None] = mapped_column(Json)           # [{nome, argumentos, erro?}]
    tokens_entrada: Mapped[int | None] = mapped_column(Integer)
    tokens_saida: Mapped[int | None] = mapped_column(Integer)
    duracao_ms: Mapped[int | None] = mapped_column(Integer)
    resultado: Mapped[str] = mapped_column(String(16), nullable=False, default="ok")  # ok | erro | recusa
