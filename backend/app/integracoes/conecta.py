"""Adaptadores reais do **Conecta gov.br** (SERPRO) — CadÚnico/Bolsa Família e CPF.

Contrato levantado em 30/08/2026 no catálogo oficial (https://www.gov.br/conecta/catalogo/):

Autenticação (comum a todas as APIs do Conecta)
  POST {gateway}/oauth2/jwt-token           grant_type=client_credentials, Basic <chave:senha>
  → {"access_token": "...", "token_type": "Bearer", "expires_in": 7200}   (token vale 2 h)
  Toda chamada leva `Authorization: Bearer <token>` e `x-cpf-usuario: <CPF do servidor que consulta>`
  (rastreabilidade exigida pelo Conecta). Acesso exige adesão do órgão, chave gerada no Gerenciador
  do Conecta e IP liberado no firewall do SERPRO. Homologação: 1.000 chamadas por API.

CADÚNICO — Serviços Dados Familiares (MDS), v1.0.0
  GET {gateway}/api-cadunico-servicos-dados/v1/dp/dadosFamiliar/{cpf}
  GET {gateway}/api-cadunico-servicos-dados/v1/dp/dadosFamiliar/nis/{nis}
  → {"pessoaCadastrada": bool, "cadastroAtualizado": bool, "familiabeneficiariaBolsaFamilia": bool,
     "faixaRendaFamiliarPerCapita": {"codigo": 1..5, "descricao": "..."},
     "faixaRendaFamiliarTotal": {"codigo": 1..4, "descricao": "..."},
     "municipio": {"codigoIBGE": "3304557", "nome": "Rio de Janeiro", "siglaUF": "RJ"},
     "caracteristicasLocalDomicilio": {"codigo": 1|2, "descricao": "Urbano|Rural"},
     "quantidadePessoasFamilia": int, "idade": int, "dataUltimaAtualizacao": "AAAA-MM-DD",
     "racacor": {...}, "gpte": [{"codigo": "000".."306", "descricao": "..."}]}

CPF Light v2 (Receita Federal / Cadastro Base do Cidadão)
  POST {gateway}/api-cpf-light/v2/consulta/identificacao      body {"listaCpf": ["00000000000"]}
  → [{"CPF": "...", "Nome": "...", "NomeSocial": "...", "NomeMae": "...", "DataNascimento": "AAAAMMDD",
      "SituacaoCadastral": "0", "Sexo": "1|2|9", "AnoObito": "", "DataInscricao": "AAAAMMDD"}]
  SituacaoCadastral: 0 regular · 2 suspensa · 3 titular falecido · 4 pendente de regularização ·
                     5 cancelada por multiplicidade · 8 nula · 9 cancelada de ofício

Gateways
  produção    https://apigateway.conectagov.estaleiro.serpro.gov.br
  homologação https://h-apigateway.conectagov.np.estaleiro.serpro.gov.br

Nesta fase os adaptadores ficam desligados por padrão (sem credencial). Com `COMPROVACAO_PROVIDER=conecta`
e as variáveis CONECTA_* definidas, eles fazem a chamada real. A base do hackathon é anonimizada — não há
CPF/NIS nela; o campo `documento` só existirá quando a inscrição vier do `matricula.rio`.

LGPD: só os campos necessários ao critério ficam no `payload`; nome, mãe e nascimento NÃO são persistidos.
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from app.integracoes.base import DadosInscricao, ResultadoComprovacao

GATEWAYS = {
    "producao": "https://apigateway.conectagov.estaleiro.serpro.gov.br",
    "homologacao": "https://h-apigateway.conectagov.np.estaleiro.serpro.gov.br",
}
SITUACAO_CPF = {
    "0": "regular", "2": "suspensa", "3": "titular_falecido", "4": "pendente_regularizacao",
    "5": "cancelada_multiplicidade", "8": "nula", "9": "cancelada_oficio",
}


@dataclass
class ConfigConecta:
    ambiente: str = os.getenv("CONECTA_AMBIENTE", "homologacao")
    chave: str | None = os.getenv("CONECTA_CHAVE")
    senha: str | None = os.getenv("CONECTA_SENHA")
    cpf_usuario: str | None = os.getenv("CONECTA_CPF_USUARIO")   # servidor que consulta (auditoria do Conecta)
    timeout_s: float = float(os.getenv("CONECTA_TIMEOUT", "8"))

    @property
    def gateway(self) -> str:
        return GATEWAYS[self.ambiente]

    @property
    def configurado(self) -> bool:
        return bool(self.chave and self.senha and self.cpf_usuario)


class ClienteConecta:
    """Token OAuth2 client-credentials com cache (2 h) e chamadas HTTP mínimas, sem dependência extra."""

    def __init__(self, cfg: ConfigConecta | None = None):
        self.cfg = cfg or ConfigConecta()
        self._token: str | None = None
        self._expira_em: float = 0.0

    def token(self) -> str:
        if self._token and time.time() < self._expira_em - 60:
            return self._token
        basic = base64.b64encode(f"{self.cfg.chave}:{self.cfg.senha}".encode()).decode()
        req = urllib.request.Request(
            f"{self.cfg.gateway}/oauth2/jwt-token", data=b"grant_type=client_credentials", method="POST",
            headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(req, timeout=self.cfg.timeout_s) as resp:
            body = json.loads(resp.read())
        self._token = body["access_token"]
        self._expira_em = time.time() + int(body.get("expires_in", 7200))
        return self._token

    def get(self, path: str) -> dict:
        req = urllib.request.Request(f"{self.cfg.gateway}{path}", headers=self._headers())
        with urllib.request.urlopen(req, timeout=self.cfg.timeout_s) as resp:
            return json.loads(resp.read())

    def post(self, path: str, body: dict) -> dict | list:
        req = urllib.request.Request(f"{self.cfg.gateway}{path}", data=json.dumps(body).encode(), method="POST",
                                     headers={**self._headers(), "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.cfg.timeout_s) as resp:
            return json.loads(resp.read())

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token()}", "x-cpf-usuario": self.cfg.cpf_usuario or "",
                "Accept": "application/json"}


def _documento(i: DadosInscricao) -> str | None:
    """CPF ou NIS do responsável. A base anonimizada não traz nenhum dos dois."""
    return getattr(i, "documento_responsavel", None)


def _erro(criterio: str, fonte: str, exc: Exception, servico: str) -> ResultadoComprovacao:
    detalhe = f"HTTP {exc.code}" if isinstance(exc, urllib.error.HTTPError) else type(exc).__name__
    return ResultadoComprovacao(criterio, fonte, "erro", None, {"servico": servico, "erro": detalhe})


class ConectaCadUnico:
    """Critério CadÚnico (51 pts na Res. 542/2025): `pessoaCadastrada` e `cadastroAtualizado`."""
    criterio = "cadunico"
    fonte = "conecta_cadunico"
    SERVICO = "api-cadunico-servicos-dados/v1/dp/dadosFamiliar"

    def __init__(self, cliente: ClienteConecta | None = None):
        self.cliente = cliente or ClienteConecta()

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        if not self.cliente.cfg.configurado:
            return ResultadoComprovacao(self.criterio, self.fonte, "pendente", None,
                                        {"servico": self.SERVICO, "motivo": "credencial do Conecta não configurada"})
        doc = _documento(i)
        if not doc:
            return ResultadoComprovacao(self.criterio, self.fonte, "pendente", None,
                                        {"servico": self.SERVICO, "motivo": "inscrição sem CPF/NIS (base anonimizada)"})
        try:
            path = f"/{self.SERVICO}/nis/{doc}" if len(doc) == 11 and doc.startswith("1") and False else f"/{self.SERVICO}/{doc}"
            r = self.cliente.get(path)
        except Exception as exc:  # noqa: BLE001 — nunca propaga
            return _erro(self.criterio, self.fonte, exc, self.SERVICO)
        cadastrada = bool(r.get("pessoaCadastrada"))
        atualizado = bool(r.get("cadastroAtualizado"))
        payload = {  # minimizado
            "servico": self.SERVICO,
            "pessoaCadastrada": cadastrada, "cadastroAtualizado": atualizado,
            "faixaRendaFamiliarPerCapita": (r.get("faixaRendaFamiliarPerCapita") or {}).get("codigo"),
            "municipio": (r.get("municipio") or {}).get("codigoIBGE"),
            "dataUltimaAtualizacao": r.get("dataUltimaAtualizacao"),
            "familiabeneficiariaBolsaFamilia": bool(r.get("familiabeneficiariaBolsaFamilia")),
        }
        return ResultadoComprovacao(self.criterio, self.fonte,
                                    "confirmado" if cadastrada and atualizado else "nao_encontrado",
                                    r.get("dataUltimaAtualizacao"), payload)


class ConectaBolsaFamilia:
    """Critério Bolsa Família (5 pts): mesmo endpoint do CadÚnico, campo `familiabeneficiariaBolsaFamilia`."""
    criterio = "bolsa_familia"
    fonte = "conecta_bolsa_familia"
    SERVICO = ConectaCadUnico.SERVICO

    def __init__(self, cliente: ClienteConecta | None = None):
        self.cliente = cliente or ClienteConecta()

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        if not self.cliente.cfg.configurado or not _documento(i):
            return ResultadoComprovacao(self.criterio, self.fonte, "pendente", None,
                                        {"servico": self.SERVICO, "motivo": "sem credencial ou sem CPF/NIS"})
        try:
            r = self.cliente.get(f"/{self.SERVICO}/{_documento(i)}")
        except Exception as exc:  # noqa: BLE001
            return _erro(self.criterio, self.fonte, exc, self.SERVICO)
        benef = bool(r.get("familiabeneficiariaBolsaFamilia"))
        return ResultadoComprovacao(self.criterio, self.fonte, "confirmado" if benef else "nao_encontrado",
                                    r.get("dataUltimaAtualizacao"),
                                    {"servico": self.SERVICO, "familiabeneficiariaBolsaFamilia": benef})


class ReceitaCPF:
    """Identidade do responsável: CPF Light v2, operação `identificacao`. Só a situação cadastral é guardada."""
    criterio = "cpf"
    fonte = "receita_cpf"
    SERVICO = "api-cpf-light/v2/consulta/identificacao"

    def __init__(self, cliente: ClienteConecta | None = None):
        self.cliente = cliente or ClienteConecta()

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        doc = _documento(i)
        if not self.cliente.cfg.configurado or not doc:
            return ResultadoComprovacao(self.criterio, self.fonte, "pendente", None,
                                        {"servico": self.SERVICO, "motivo": "sem credencial ou sem CPF"})
        try:
            r = self.cliente.post(f"/{self.SERVICO}", {"listaCpf": [doc]})
        except Exception as exc:  # noqa: BLE001
            return _erro(self.criterio, self.fonte, exc, self.SERVICO)
        item = (r[0] if isinstance(r, list) and r else r) or {}
        sit = str(item.get("SituacaoCadastral", ""))
        return ResultadoComprovacao(self.criterio, self.fonte, "confirmado" if sit == "0" else "nao_encontrado", None,
                                    {"servico": self.SERVICO, "situacaoCadastral": sit,
                                     "situacao": SITUACAO_CPF.get(sit, "desconhecida")})


PROVEDORES_CONECTA = (ConectaCadUnico, ConectaBolsaFamilia, ReceitaCPF)
