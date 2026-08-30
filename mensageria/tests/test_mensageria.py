"""Testes do serviço de mensageria. Nenhum toca a rede: tudo roda no provedor `mock`.

O que está sendo protegido, em ordem de importância:
1. Nenhuma mensagem sai com `{variavel}` no lugar do dado — família recebendo texto quebrado é pior
   que família não recebendo.
2. O destino em claro não aparece na resposta nem no log.
3. Repetir o mesmo pedido não gera duas mensagens.
4. Provedor sem credencial devolve `pendente`, nunca derruba o chamador.
"""
from __future__ import annotations

import json
import logging

import pytest
from fastapi.testclient import TestClient

from app import destinos, idempotencia
from app.config import get_settings
from app.main import app
from app.provedores.registry import _construir

CLIENTE = TestClient(app)
NUMERO = "+5521999998888"
EMAIL = "responsavel@exemplo.org"
CONVOCACAO = {"crianca": "Criança Teste", "unidade": "EDI Exemplo", "grupamento": "Berçário",
              "horario": "Integral", "prazo": "02/09/2026"}


# Estado de partida de todo teste. São **variáveis de ambiente**, não `delenv`, de propósito: o `.env`
# da raiz do repositório alimenta o `Settings`, e na máquina de quem desenvolve ele tem credencial de
# verdade. Variável de ambiente tem precedência sobre o arquivo — é o que torna o teste hermético e
# garante que uma suíte verde nunca dependeu (nem falou com) a Twilio ou o Resend de alguém.
AMBIENTE_DE_TESTE = {
    "MENSAGERIA_WHATSAPP": "mock", "MENSAGERIA_EMAIL": "mock", "MENSAGERIA_SMS": "mock",
    "MENSAGERIA_TOKEN": "", "MENSAGERIA_BACKOFF_S": "0",
    "TWILIO_ACCOUNT_SID": "", "TWILIO_AUTH_TOKEN": "", "TWILIO_SMS_FROM": "",
    "TWILIO_WHATSAPP_FROM": "whatsapp:+14155238886", "TWILIO_CONTENT_SIDS": "",
    "RESEND_API_KEY": "", "SMTP_HOST": "",
}


@pytest.fixture(autouse=True)
def ambiente_limpo(monkeypatch):
    """Cada teste começa em `mock`, sem credencial, sem token e sem cache."""
    for chave, valor in AMBIENTE_DE_TESTE.items():
        monkeypatch.setenv(chave, valor)
    _recarregar()
    idempotencia.limpar()
    yield
    _recarregar()
    idempotencia.limpar()


def _recarregar() -> None:
    get_settings.cache_clear()
    _construir.cache_clear()


def _configurar(monkeypatch, **env: str) -> None:
    for chave, valor in env.items():
        monkeypatch.setenv(chave, valor)
    _recarregar()


def _enviar(**corpo):
    return CLIENTE.post("/api/v1/enviar", json=corpo)


# ── normalização de destino ──────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("entrada", [
    "+55 21 99999-8888", "5521999998888", "21999998888", "(21) 99999-8888", "+5521999998888",
])
def test_telefone_brasileiro_vira_e164(entrada):
    assert destinos.normalizar_telefone(entrada) == NUMERO


def test_nono_digito_nao_e_removido():
    """Quem informou o número informou como ele existe. Mexer nisso quebra o WhatsApp de quem tem 9."""
    assert destinos.normalizar_telefone("24 99944-1846") == "+5524999441846"


def test_telefone_internacional_preservado():
    assert destinos.normalizar_telefone("+1 415 523 8886") == "+14155238886"


@pytest.mark.parametrize("ruim", ["", "123", "9999999999999999999", "21 9999-8888-777", "00 99999-8888"])
def test_telefone_invalido_e_recusado(ruim):
    with pytest.raises(ValueError):
        destinos.normalizar_telefone(ruim)


def test_email_normalizado_para_minusculo():
    assert destinos.normalizar_email("  Responsavel@Exemplo.ORG ") == EMAIL


@pytest.mark.parametrize("ruim", ["semarroba", "a@b", "@exemplo.org", "a b@exemplo.org"])
def test_email_invalido_e_recusado(ruim):
    with pytest.raises(ValueError):
        destinos.normalizar_email(ruim)


def test_mascara_esconde_o_miolo_do_numero_e_do_email():
    assert destinos.mascarar("whatsapp", NUMERO) == "+5521*****8888"
    assert destinos.mascarar("email", EMAIL) == "r*********l@exemplo.org"


# ── catálogo de mensagens ────────────────────────────────────────────────────────────────────────

def test_catalogo_lista_os_dados_obrigatorios():
    r = CLIENTE.get("/api/v1/templates")
    assert r.status_code == 200
    por_nome = {t["nome"]: t for t in r.json()["templates"]}
    assert "crianca" in por_nome["convocacao_vaga"]["obrigatorios"]
    # `responsavel` tem valor padrão: convocar sem saber o nome de quem atende não pode travar o envio.
    assert "responsavel" not in por_nome["convocacao_vaga"]["obrigatorios"]


def test_template_desconhecido_e_422():
    r = _enviar(canal="whatsapp", destino=NUMERO, template="nao_existe", dados={})
    assert r.status_code == 422
    assert "template desconhecido" in r.json()["detail"]


def test_dado_faltando_e_422_antes_de_qualquer_envio():
    r = _enviar(canal="whatsapp", destino=NUMERO, template="convocacao_vaga",
                dados={"crianca": "Criança Teste"})
    assert r.status_code == 422
    detalhe = r.json()["detail"]
    assert "faltam dados" in detalhe and "unidade" in detalhe and "prazo" in detalhe


def test_nenhuma_chave_sobra_no_texto_renderizado():
    """Varre o catálogo inteiro: nenhum template pode chegar à família com `{variavel}` no corpo."""
    from app.templates import TEMPLATES
    for t in TEMPLATES.values():
        assunto, texto, _ = t.render({k: f"valor de {k}" for k in t.obrigatorios})
        assert "{" not in texto and "}" not in texto, t.nome
        assert "{" not in assunto and "}" not in assunto, t.nome


def test_destino_invalido_e_422():
    r = _enviar(canal="email", destino="isto-nao-e-email", template="teste", dados={})
    assert r.status_code == 422
    assert "destino inválido" in r.json()["detail"]


# ── envio ────────────────────────────────────────────────────────────────────────────────────────

def test_envio_no_mock_nao_manda_nada_e_devolve_simulado():
    r = _enviar(canal="whatsapp", destino=NUMERO, template="convocacao_vaga", dados=CONVOCACAO,
                referencia="convocacao:1")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["resultado"] == "simulado"
    assert corpo["provedor"] == "mock_whatsapp"
    assert corpo["protocolo"].startswith("MOCK-")
    assert corpo["referencia"] == "convocacao:1"


def test_resposta_nunca_traz_o_destino_em_claro():
    r = _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={})
    corpo = r.json()
    assert NUMERO not in json.dumps(corpo)
    assert corpo["destino"] == destinos.mascarar("whatsapp", NUMERO)
    assert corpo["destino_id"] == destinos.impressao(NUMERO)


def test_log_de_envio_nao_carrega_conteudo_nem_destino(caplog):
    with caplog.at_level(logging.INFO, logger="mensageria.envio"):
        _enviar(canal="email", destino=EMAIL, template="convocacao_vaga", dados=CONVOCACAO,
                referencia="convocacao:9", ator="polo")
    linhas = [r.getMessage() for r in caplog.records if r.name == "mensageria.envio"]
    assert linhas, "o envio precisa deixar rastro"
    registrado = json.loads(linhas[-1])
    assert registrado["referencia"] == "convocacao:9" and registrado["ator"] == "polo"
    assert EMAIL not in linhas[-1]
    assert CONVOCACAO["crianca"] not in linhas[-1]   # nome de criança não vai para log


def test_impressao_digital_e_estavel_e_nao_reversivel():
    a = destinos.impressao(NUMERO)
    assert a == destinos.impressao(NUMERO) and a != destinos.impressao("+5521999998887")
    assert NUMERO not in a


# ── idempotência ─────────────────────────────────────────────────────────────────────────────────

def test_mesma_chave_nao_reenvia():
    pedido = dict(canal="whatsapp", destino=NUMERO, template="convocacao_vaga", dados=CONVOCACAO,
                  chave_idem="convocacao:42:whatsapp")
    primeiro, segundo = _enviar(**pedido).json(), _enviar(**pedido).json()
    assert primeiro["repetido"] is False and segundo["repetido"] is True
    assert segundo["protocolo"] == primeiro["protocolo"]


def test_chaves_diferentes_enviam_duas_vezes():
    base = dict(canal="whatsapp", destino=NUMERO, template="teste", dados={})
    a = _enviar(**base, chave_idem="a").json()
    b = _enviar(**base, chave_idem="b").json()
    assert a["repetido"] is False and b["repetido"] is False and a["id"] != b["id"]


def test_chave_igual_em_canais_diferentes_nao_colide():
    a = _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={}, chave_idem="x").json()
    b = _enviar(canal="email", destino=EMAIL, template="teste", dados={}, chave_idem="x").json()
    assert b["repetido"] is False and a["canal"] != b["canal"]


# ── lote ─────────────────────────────────────────────────────────────────────────────────────────

def test_lote_separa_o_que_saiu_do_que_foi_recusado():
    r = CLIENTE.post("/api/v1/enviar-lote", json={"mensagens": [
        {"canal": "whatsapp", "destino": NUMERO, "template": "teste", "dados": {}},
        {"canal": "email", "destino": EMAIL, "template": "teste", "dados": {}},
        {"canal": "whatsapp", "destino": "123", "template": "teste", "dados": {}},
        {"canal": "whatsapp", "destino": NUMERO, "template": "convocacao_vaga", "dados": {}},
    ]})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["total"] == 4
    assert corpo["por_resultado"] == {"simulado": 2, "invalido": 2}
    # a posição volta junto: dá para corrigir na origem sem adivinhar qual falhou
    assert [i["indice"] for i in corpo["invalidos"]] == [2, 3]


def test_lote_acima_do_teto_e_recusado(monkeypatch):
    _configurar(monkeypatch, MENSAGERIA_LOTE_MAX="2")
    from app import main
    monkeypatch.setattr(main, "settings", get_settings())
    r = CLIENTE.post("/api/v1/enviar-lote", json={"mensagens": [
        {"canal": "whatsapp", "destino": NUMERO, "template": "teste", "dados": {}} for _ in range(3)
    ]})
    assert r.status_code == 413


# ── provedores reais sem credencial ──────────────────────────────────────────────────────────────

def test_twilio_sem_credencial_fica_pendente_e_nao_derruba(monkeypatch):
    _configurar(monkeypatch, MENSAGERIA_WHATSAPP="twilio")
    corpo = _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={}).json()
    assert corpo["resultado"] == "pendente"
    assert corpo["provedor"] == "twilio_whatsapp"
    assert "TWILIO_ACCOUNT_SID" in corpo["detalhe"]


def test_resend_sem_credencial_fica_pendente(monkeypatch):
    _configurar(monkeypatch, MENSAGERIA_EMAIL="resend")
    corpo = _enviar(canal="email", destino=EMAIL, template="teste", dados={}).json()
    assert corpo["resultado"] == "pendente" and "RESEND_API_KEY" in corpo["detalhe"]


def test_sms_sem_numero_comprado_fica_pendente(monkeypatch):
    """O sandbox da Twilio é só WhatsApp: SMS precisa de número próprio e isso tem de ficar explícito."""
    _configurar(monkeypatch, MENSAGERIA_SMS="twilio", TWILIO_ACCOUNT_SID="AC0", TWILIO_AUTH_TOKEN="tok")
    corpo = _enviar(canal="sms", destino=NUMERO, template="teste", dados={}).json()
    assert corpo["resultado"] == "pendente" and "TWILIO_SMS_FROM" in corpo["detalhe"]


def test_provedor_inexistente_derruba_a_subida(monkeypatch):
    from app.provedores.registry import validar
    _configurar(monkeypatch, MENSAGERIA_EMAIL="mandrake")
    with pytest.raises(RuntimeError, match="provedor desconhecido"):
        validar()


# ── autenticação ─────────────────────────────────────────────────────────────────────────────────

def test_sem_token_configurado_a_api_fica_aberta():
    assert _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={}).status_code == 200


def test_com_token_configurado_o_envio_exige_bearer(monkeypatch):
    _configurar(monkeypatch, MENSAGERIA_TOKEN="segredo")
    corpo = {"canal": "whatsapp", "destino": NUMERO, "template": "teste", "dados": {}}
    assert CLIENTE.post("/api/v1/enviar", json=corpo).status_code == 401
    assert CLIENTE.post("/api/v1/enviar", json=corpo,
                        headers={"Authorization": "Bearer errado"}).status_code == 401
    assert CLIENTE.post("/api/v1/enviar", json=corpo,
                        headers={"Authorization": "Bearer segredo"}).status_code == 200


def test_saude_nao_exige_token_e_nao_vaza_credencial(monkeypatch):
    _configurar(monkeypatch, MENSAGERIA_TOKEN="segredo", MENSAGERIA_EMAIL="resend", RESEND_API_KEY="re_secreta")
    r = CLIENTE.get("/api/v1/saude")
    assert r.status_code == 200
    assert "re_secreta" not in r.text
    assert r.json()["canais"]["email"] == {"provedor": "resend", "configurado": True, "modo": "real"}


# ── formato da requisição aos provedores reais (sem rede) ────────────────────────────────────────
#
# Estes testes existem porque o primeiro envio de verdade é o pior lugar para descobrir que o corpo
# da requisição está errado. Substituem o `httpx.AsyncClient` por um duplo que grava a chamada.

class _RespostaFalsa:
    def __init__(self, status: int, corpo: dict):
        self.status_code, self._corpo = status, corpo
        self.text = json.dumps(corpo)

    @property
    def is_success(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self) -> dict:
        return self._corpo


def _espiar(monkeypatch, modulo, status: int, corpo: dict) -> dict:
    """Troca o httpx do módulo por um duplo e devolve o dicionário onde a chamada fica gravada."""
    capturado: dict = {}

    class _ClienteFalso:
        def __init__(self, **kw):
            capturado["cliente"] = kw

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def post(self, url, **kw):
            capturado.update(url=url, **kw)
            return _RespostaFalsa(status, corpo)

    monkeypatch.setattr(modulo.httpx, "AsyncClient", _ClienteFalso)
    return capturado


def test_twilio_monta_a_requisicao_no_formato_da_api(monkeypatch):
    from app.provedores import twilio as mod
    _configurar(monkeypatch, MENSAGERIA_WHATSAPP="twilio",
                TWILIO_ACCOUNT_SID="AC123", TWILIO_AUTH_TOKEN="tok")
    visto = _espiar(monkeypatch, mod, 201, {"sid": "SM999", "status": "queued", "error_code": None})

    corpo = _enviar(canal="whatsapp", destino="24 99944-1846", template="teste", dados={}).json()

    assert visto["url"] == "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
    assert visto["auth"] == ("AC123", "tok")
    assert visto["data"]["To"] == "whatsapp:+5524999441846"      # prefixo do canal nos dois lados
    assert visto["data"]["From"] == "whatsapp:+14155238886"
    assert visto["data"]["Body"].startswith("Mensagem de teste")
    assert corpo["resultado"] == "enviado" and corpo["protocolo"] == "SM999"


def test_twilio_fora_da_janela_de_24h_explica_o_que_fazer(monkeypatch):
    from app.provedores import twilio as mod
    _configurar(monkeypatch, MENSAGERIA_WHATSAPP="twilio",
                TWILIO_ACCOUNT_SID="AC123", TWILIO_AUTH_TOKEN="tok")
    _espiar(monkeypatch, mod, 400, {"code": 63016, "message": "Failed to send freeform message"})

    corpo = _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={}).json()
    assert corpo["resultado"] == "falha"
    assert "63016" in corpo["detalhe"] and "join" in corpo["detalhe"]
    assert corpo["tentativas"] == 1, "erro permanente não deve ser repetido"


def test_twilio_repete_erro_transitorio(monkeypatch):
    from app.provedores import twilio as mod
    _configurar(monkeypatch, MENSAGERIA_WHATSAPP="twilio", TWILIO_ACCOUNT_SID="AC1",
                TWILIO_AUTH_TOKEN="t", MENSAGERIA_TENTATIVAS="3", MENSAGERIA_BACKOFF_S="0")
    _espiar(monkeypatch, mod, 503, {"code": 20503, "message": "temporariamente indisponível"})

    corpo = _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={}).json()
    assert corpo["resultado"] == "falha" and corpo["tentativas"] == 3


def test_resend_monta_a_requisicao_no_formato_da_api(monkeypatch):
    from app.provedores import resend as mod
    _configurar(monkeypatch, MENSAGERIA_EMAIL="resend", RESEND_API_KEY="re_chave")
    visto = _espiar(monkeypatch, mod, 200, {"id": "49a3999c-0ce1"})

    corpo = _enviar(canal="email", destino="Responsavel@Exemplo.ORG", template="convocacao_vaga",
                    dados=CONVOCACAO, chave_idem="convocacao:5:email").json()

    assert visto["url"] == "https://api.resend.com/emails"
    assert visto["headers"]["Authorization"] == "Bearer re_chave"
    assert visto["headers"]["Idempotency-Key"] == "convocacao:5:email"
    assert visto["json"]["to"] == [EMAIL]                        # normalizado para minúsculo
    assert CONVOCACAO["unidade"] in visto["json"]["html"]
    assert visto["json"]["text"] and visto["json"]["subject"]     # texto alternativo sempre presente
    assert corpo["resultado"] == "enviado" and corpo["protocolo"] == "49a3999c-0ce1"


def test_resend_403_com_remetente_de_teste_avisa_da_limitacao(monkeypatch):
    from app.provedores import resend as mod
    _configurar(monkeypatch, MENSAGERIA_EMAIL="resend", RESEND_API_KEY="re_chave")
    _espiar(monkeypatch, mod, 403, {"message": "You can only send testing emails to your own address"})

    corpo = _enviar(canal="email", destino=EMAIL, template="teste", dados={}).json()
    assert corpo["resultado"] == "falha" and "verifique um domínio" in corpo["detalhe"]


# ── Content Template do WhatsApp (ContentSid) ────────────────────────────────────────────────────
#
# Em conta trial a Twilio recusa `Body` mesmo com a janela de 24 h aberta (`21654 ContentSid Required`),
# e a Content API que listaria os templates está bloqueada. O mapa `TWILIO_CONTENT_SIDS` é a ponte.

MAPA_CONTENT = json.dumps({
    "convocacao_vaga": {"sid": "HXtemplate1",
                        "variaveis": ["{crianca}", "{unidade} — {grupamento} {horario}", "{prazo}"]},
    "teste": {"sid": "HXtemplate2", "variaveis": []},
})


def _twilio_com_content(monkeypatch, mapa=MAPA_CONTENT):
    from app.provedores import twilio as mod
    _configurar(monkeypatch, MENSAGERIA_WHATSAPP="twilio", TWILIO_ACCOUNT_SID="AC1",
                TWILIO_AUTH_TOKEN="t", TWILIO_CONTENT_SIDS=mapa)
    return _espiar(monkeypatch, mod, 201, {"sid": "SM1", "status": "queued", "error_code": None})


def test_com_mapa_o_envio_usa_contentsid_no_lugar_de_body(monkeypatch):
    visto = _twilio_com_content(monkeypatch)
    _enviar(canal="whatsapp", destino=NUMERO, template="convocacao_vaga", dados=CONVOCACAO)

    assert visto["data"]["ContentSid"] == "HXtemplate1"
    assert "Body" not in visto["data"], "Body junto com ContentSid é o que a Twilio recusa"
    assert json.loads(visto["data"]["ContentVariables"]) == {
        "1": "Criança Teste", "2": "EDI Exemplo — Berçário Integral", "3": "02/09/2026"}


def test_template_sem_mapa_continua_em_texto_livre(monkeypatch):
    """Dentro da janela de 24 h, com conta paga, `Body` é o caminho normal — não pode ser perdido."""
    visto = _twilio_com_content(monkeypatch)
    _enviar(canal="whatsapp", destino=NUMERO, template="vaga_expirada",
            dados={"crianca": "Criança Teste", "unidade": "EDI Exemplo"})
    assert "ContentSid" not in visto["data"] and visto["data"]["Body"]


def test_content_template_sem_variaveis_nao_manda_o_campo(monkeypatch):
    visto = _twilio_com_content(monkeypatch)
    _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={})
    assert visto["data"]["ContentSid"] == "HXtemplate2" and "ContentVariables" not in visto["data"]


def test_dado_ausente_no_molde_vira_vazio_e_nao_derruba(monkeypatch):
    """O template já foi aprovado com N campos: faltar um valor não pode impedir a mensagem de sair."""
    from app.provedores import twilio as mod
    _configurar(monkeypatch, MENSAGERIA_WHATSAPP="twilio", TWILIO_ACCOUNT_SID="AC1", TWILIO_AUTH_TOKEN="t",
                TWILIO_CONTENT_SIDS=json.dumps(
                    {"teste": {"sid": "HX9", "variaveis": ["{origem}", "{nao_existe}"]}}))
    visto = _espiar(monkeypatch, mod, 201, {"sid": "SM1", "status": "queued", "error_code": None})
    corpo = _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={"origem": "demo"}).json()
    assert json.loads(visto["data"]["ContentVariables"]) == {"1": "demo", "2": ""}
    assert corpo["resultado"] == "enviado"


def test_mapa_invalido_cai_para_texto_livre_em_vez_de_falhar(monkeypatch):
    """JSON com vírgula a mais não pode significar convocação não enviada."""
    from app.provedores import twilio as mod
    _configurar(monkeypatch, MENSAGERIA_WHATSAPP="twilio", TWILIO_ACCOUNT_SID="AC1",
                TWILIO_AUTH_TOKEN="t", TWILIO_CONTENT_SIDS="{isto nao e json}")
    visto = _espiar(monkeypatch, mod, 201, {"sid": "SM1", "status": "queued", "error_code": None})
    corpo = _enviar(canal="whatsapp", destino=NUMERO, template="teste", dados={}).json()
    assert visto["data"]["Body"] and "ContentSid" not in visto["data"]
    assert corpo["resultado"] == "enviado"


def test_email_ignora_o_mapa_de_content(monkeypatch):
    from app.provedores import resend as mod
    _configurar(monkeypatch, MENSAGERIA_EMAIL="resend", RESEND_API_KEY="re_k",
                TWILIO_CONTENT_SIDS=MAPA_CONTENT)
    visto = _espiar(monkeypatch, mod, 200, {"id": "e1"})
    _enviar(canal="email", destino=EMAIL, template="convocacao_vaga", dados=CONVOCACAO)
    assert visto["json"]["subject"] and "ContentSid" not in json.dumps(visto["json"])


def test_a_suite_nunca_usa_credencial_do_env_do_desenvolvedor():
    """Guarda-corpo do `ambiente_limpo`: se o override cair, isto falha aqui em vez de mandar uma
    mensagem de verdade no meio da suíte."""
    s = get_settings()
    assert (s.mensageria_whatsapp, s.mensageria_email, s.mensageria_sms) == ("mock", "mock", "mock")
    assert not s.twilio_account_sid and not s.twilio_auth_token
    assert not s.resend_api_key and not s.smtp_host
