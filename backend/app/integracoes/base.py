"""Interface dos provedores de comprovação de critérios.

Um provedor consulta UMA fonte oficial (Conecta gov.br CadÚnico, Bolsa Família, Receita CPF, RMI…)
para UM critério da régua e devolve um `ResultadoComprovacao`. O adaptador real só precisa implementar
`consultar()`; o registro (`registry.py`) decide quais provedores estão ativos via `COMPROVACAO_PROVIDER`.

Regras:
- Nunca lançar exceção para fora: falha de rede/timeout vira `resultado='erro'` com o detalhe no payload.
- `payload` guarda a resposta bruta (já minimizada — sem dados além do necessário; LGPD art. 14).
- Determinístico para a mesma entrada quando possível (facilita auditoria e testes).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

RESULTADOS = ("confirmado", "nao_encontrado", "erro", "pendente")


@dataclass(frozen=True)
class DadosInscricao:
    """Subconjunto mínimo da inscrição que os provedores podem ver."""
    inscricao_id: int
    ano: int
    aluno_anon: str | None
    responsavel_anon: str | None
    nascimento_anomes: str | None
    cep: str | None
    respostas: dict[int, bool] = field(default_factory=dict)   # ich_perg_id → Sim/Nao declarado


@dataclass(frozen=True)
class ResultadoComprovacao:
    criterio: str
    fonte: str
    resultado: str                     # um de RESULTADOS
    protocolo: str | None = None
    payload: dict[str, Any] | None = None

    def __post_init__(self):
        if self.resultado not in RESULTADOS:
            raise ValueError(f"resultado inválido: {self.resultado}")


@runtime_checkable
class ProvedorComprovacao(Protocol):
    criterio: str      # ex.: 'cadunico'
    fonte: str         # ex.: 'conecta_cadunico'

    def consultar(self, inscricao: DadosInscricao) -> ResultadoComprovacao: ...
