"""Adaptador do **Registro Municipal Integrado (RMI)** — IplanRio / Prefeitura do Rio.

O RMI é a base unificada de pessoas físicas da Prefeitura (docs: https://docs.dados.rio/rmi/overview).
É por ele que a SME já cruza CadÚnico e Bolsa Família no data lake antes da classificação
(deck da SME, slide 10). Nesta fase fica desligado por padrão; sem credencial devolve `pendente`.

Fonte de dados (levantado em 30/08/2026): tabela BigQuery
  `rj-crm-registry.rmi_dados_mestres.pessoa_fisica`
com, entre outros:
  cpf, nome, nome_social, sexo, menor_idade, raca,
  nascimento{data, municipio, uf, pais}, mae{nome, cpf}, obito{indicador, ano},
  documentos{cns[]},
  endereco{indicador, principal{origem, sistema, cep, estado, municipio, tipo_logradouro, logradouro,
           numero, complemento, bairro, latitude, longitude, pluscode}, alternativo[]},
  telefone{indicador, principal{origem, sistema, ddi, ddd, valor}, alternativo[]},
  email{indicador, principal{origem, sistema, valor}, alternativo[]},
  saude{clinica_familia{indicador, id_cnes, nome, telefone}, equipe_saude_familia{...}},
  datalake{last_updated}

Acesso: solicitação interna (docs.dados.rio/data-lake/acesso-aos-dados/solicitacao-acesso-interno) e
consulta via BigQuery com credencial de serviço; a plataforma de APIs da Prefeitura
(https://docs.dados.rio/api-reference/overview, base `https://services.pref.rio`) usa JWT Bearer.

O que este adaptador entrega ao produto:
  - `contato`: telefone/endereço mais recentes da família (o que hoje está desatualizado na convocação);
  - `educacao_especial`: presença de CNS + vínculo com clínica da família como *indício* — a comprovação
    do público-alvo da educação especial continua sendo laudo, validado por humano.

LGPD: persiste-se só `indicador` e metadados (origem, data); nunca o número de telefone ou o endereço
completo no `payload` — o valor fica no sistema de convocação, com log de acesso.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from app.integracoes.base import DadosInscricao, ResultadoComprovacao

TABELA = "rj-crm-registry.rmi_dados_mestres.pessoa_fisica"
CAMPOS = (
    "cpf", "endereco.indicador", "endereco.principal.cep", "endereco.principal.bairro",
    "endereco.principal.latitude", "endereco.principal.longitude", "endereco.principal.origem",
    "telefone.indicador", "telefone.principal.origem", "telefone.principal.sistema",
    "saude.clinica_familia.indicador", "documentos.cns", "datalake.last_updated",
)


@dataclass
class ConfigRMI:
    projeto: str = os.getenv("RMI_BQ_PROJETO", "rj-crm-registry")
    credencial: str | None = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    @property
    def configurado(self) -> bool:
        return bool(self.credencial)


def _consulta_sql(cpf: str) -> str:
    """SQL exata que o adaptador real executa (BigQuery), com a partição por CPF para custo baixo."""
    return (
        f"SELECT {', '.join(CAMPOS)} FROM `{TABELA}` "
        f"WHERE cpf = '{cpf}' AND cpf_particao = CAST(SUBSTR('{cpf}', 1, 2) AS INT64) LIMIT 1"
    )


class RMIContato:
    """Canal de contato e endereço mais recentes da família, via RMI."""
    criterio = "contato"
    fonte = "rmi"

    def __init__(self, cfg: ConfigRMI | None = None):
        self.cfg = cfg or ConfigRMI()

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        cpf = getattr(i, "documento_responsavel", None)
        if not self.cfg.configurado or not cpf:
            return ResultadoComprovacao(self.criterio, self.fonte, "pendente", None,
                                        {"tabela": TABELA, "motivo": "sem credencial BigQuery ou sem CPF (base anonimizada)"})
        try:
            from google.cloud import bigquery  # type: ignore  # dependência opcional, só com credencial
            cli = bigquery.Client(project=self.cfg.projeto)
            rows = list(cli.query(_consulta_sql(cpf)).result())
        except Exception as exc:  # noqa: BLE001
            return ResultadoComprovacao(self.criterio, self.fonte, "erro", None,
                                        {"tabela": TABELA, "erro": type(exc).__name__})
        if not rows:
            return ResultadoComprovacao(self.criterio, self.fonte, "nao_encontrado", None, {"tabela": TABELA})
        r = dict(rows[0])
        tel = (r.get("telefone") or {})
        end = (r.get("endereco") or {})
        payload = {  # minimizado: indicadores e origem, nunca o valor
            "tabela": TABELA,
            "telefone_indicador": bool(tel.get("indicador")),
            "telefone_origem": (tel.get("principal") or {}).get("origem"),
            "endereco_indicador": bool(end.get("indicador")),
            "endereco_bairro": (end.get("principal") or {}).get("bairro"),
            "last_updated": str((r.get("datalake") or {}).get("last_updated")),
        }
        ok = payload["telefone_indicador"] or payload["endereco_indicador"]
        return ResultadoComprovacao(self.criterio, self.fonte, "confirmado" if ok else "nao_encontrado",
                                    payload["last_updated"], payload)


class RMIEducacaoEspecial:
    """Indício para educação especial (CNS + clínica da família). Decisão final é humana, com laudo."""
    criterio = "educacao_especial"
    fonte = "rmi"

    def __init__(self, cfg: ConfigRMI | None = None):
        self.cfg = cfg or ConfigRMI()

    def consultar(self, i: DadosInscricao) -> ResultadoComprovacao:
        return ResultadoComprovacao(self.criterio, self.fonte, "pendente", None,
                                    {"tabela": TABELA, "motivo": "requer laudo; RMI só fornece indício (CNS/clínica)",
                                     "human_in_the_loop": True})


PROVEDORES_RMI = (RMIContato, RMIEducacaoEspecial)
