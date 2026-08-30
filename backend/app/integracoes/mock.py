"""Provedores simulados — determinísticos por `aluno_anon`, com o formato de resposta das APIs reais.

Servem para desenvolver o fluxo e a tela sem credencial do Conecta gov.br / RMI. Não usam dado real
de criança: a base é anonimizada e o hash só decide o desfecho.
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from app.integracoes.base import DadosInscricao, ResultadoComprovacao


def _sorteio(chave: str, salt: str) -> float:
    h = hashlib.sha256(f"{salt}:{chave}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _protocolo(salt: str, chave: str) -> str:
    return f"{salt.upper()}-{hashlib.sha1(f'{salt}:{chave}'.encode()).hexdigest()[:10].upper()}"


def _agora() -> str:
    return datetime.now(UTC).isoformat()


class MockCadUnico:
    criterio = "cadunico"
    fonte = "conecta_cadunico"

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        chave = i.responsavel_anon or i.aluno_anon or str(i.inscricao_id)
        p = _sorteio(chave, self.fonte)
        if p < 0.05:
            return ResultadoComprovacao(self.criterio, self.fonte, "erro", None,
                                        {"erro": "timeout", "servico": "consulta-cadunico/v2", "consultado_em": _agora()})
        achou = p < 0.70
        return ResultadoComprovacao(
            self.criterio, self.fonte, "confirmado" if achou else "nao_encontrado", _protocolo(self.fonte, chave),
            {"servico": "consulta-cadunico/v2", "consultado_em": _agora(),
             "familia": {"situacao_cadastral": "ATUALIZADO" if achou else None,
                         "faixa_renda": "ATE_MEIO_SM" if achou else None,
                         "data_atualizacao": "2025-09-14" if achou else None}},
        )


class MockBolsaFamilia:
    criterio = "bolsa_familia"
    fonte = "conecta_bolsa_familia"

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        chave = i.responsavel_anon or i.aluno_anon or str(i.inscricao_id)
        p = _sorteio(chave, self.fonte)
        achou = p < 0.45
        return ResultadoComprovacao(
            self.criterio, self.fonte, "confirmado" if achou else "nao_encontrado", _protocolo(self.fonte, chave),
            {"servico": "consulta-bolsa-familia/v1", "consultado_em": _agora(),
             "beneficio": {"situacao": "LIBERADO" if achou else None, "competencia": "2025-11" if achou else None}},
        )


class MockReceitaCPF:
    criterio = "cpf"
    fonte = "receita_cpf"

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        chave = i.aluno_anon or str(i.inscricao_id)
        p = _sorteio(chave, self.fonte)
        regular = p < 0.97
        return ResultadoComprovacao(
            self.criterio, self.fonte, "confirmado" if regular else "nao_encontrado", _protocolo(self.fonte, chave),
            {"servico": "consulta-cpf/v1", "consultado_em": _agora(),
             "situacao_cadastral": "REGULAR" if regular else "PENDENTE_REGULARIZACAO",
             "nascimento_anomes_confere": bool(i.nascimento_anomes)},
        )


class MockRMIEducacaoEspecial:
    criterio = "educacao_especial"
    fonte = "rmi"

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        chave = i.aluno_anon or str(i.inscricao_id)
        p = _sorteio(chave, self.fonte)
        achou = p < 0.06
        return ResultadoComprovacao(
            self.criterio, self.fonte, "confirmado" if achou else "nao_encontrado", _protocolo(self.fonte, chave),
            {"servico": "rmi/cidadao/v1", "consultado_em": _agora(),
             "saude": {"laudo_registrado": achou, "origem": "SMS" if achou else None}},
        )


PROVEDORES_MOCK = [MockCadUnico(), MockBolsaFamilia(), MockReceitaCPF(), MockRMIEducacaoEspecial()]
