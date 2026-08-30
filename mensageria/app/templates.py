"""Catálogo de mensagens.

O backend manda **`template` + `dados`**, nunca texto pronto. Motivos:

1. O texto que chega à família fica versionado em um lugar só, revisável pela SME.
2. O backend não compõe mensagem — logo, não precisa saber redigir para a família.
3. Em produção o WhatsApp exige **template aprovado pela Meta** para mensagem iniciada pelo
   negócio fora da janela de 24 h. Com o catálogo aqui, trocar `texto` livre por `ContentSid`
   aprovado é mudança de configuração, não de código do backend.

Linguagem: frase curta, sem jargão, sem sigla não explicada — `spec/05` exige que o resultado seja
"explicável em linguagem de responsável". Nenhum template afirma pontuação, posição na fila ou
critério: a régua é norma (Res. SME 542/2025) e quem classifica é o motor.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_VARIAVEL = re.compile(r"\{(\w+)\}")


@dataclass(frozen=True)
class Template:
    nome: str
    assunto: str                              # usado no e-mail; ignorado no WhatsApp/SMS
    texto: str                                # WhatsApp e SMS; vira o corpo alternativo do e-mail
    html: str | None = None                   # e-mail; se ausente, é gerado a partir do texto
    opcionais: dict[str, str] = field(default_factory=dict)   # variável → valor padrão

    @property
    def variaveis(self) -> set[str]:
        alvo = f"{self.assunto} {self.texto} {self.html or ''}"
        return set(_VARIAVEL.findall(alvo))

    @property
    def obrigatorios(self) -> list[str]:
        return sorted(self.variaveis - set(self.opcionais))

    def render(self, dados: dict[str, object]) -> tuple[str, str, str]:
        """Devolve `(assunto, texto, html)`. Levanta `ValueError` se faltar variável obrigatória."""
        valores: dict[str, object] = {**self.opcionais, **{k: v for k, v in dados.items() if v is not None}}
        faltando = sorted(self.variaveis - set(valores))
        if faltando:
            raise ValueError(f"template {self.nome!r}: faltam dados {', '.join(faltando)}")
        limpo = {k: str(v).strip() for k, v in valores.items() if k in self.variaveis}
        assunto = self.assunto.format(**limpo)
        texto = self.texto.format(**limpo)
        html = self.html.format(**limpo) if self.html else _html_de(texto)
        return assunto, texto, html


def _html_de(texto: str) -> str:
    """HTML mínimo a partir do texto — sem imagem e sem CSS externo, que caem em filtro de spam."""
    escapado = texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    corpo = "".join(f"<p>{linha}</p>" for linha in escapado.split("\n\n") if linha.strip())
    return (
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
        'font-size:15px;line-height:1.55;color:#1c1c1c;max-width:560px">'
        f"{corpo.replace(chr(10), '<br>')}"
        '<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">'
        '<p style="font-size:12px;color:#6b6b6b">Secretaria Municipal de Educação do Rio de Janeiro — '
        "mensagem automática do sistema de Inscrição Creche. Não responda a este e-mail.</p></div>"
    )


TEMPLATES: dict[str, Template] = {
    "teste": Template(
        nome="teste",
        assunto="Teste do canal de mensagens — Inscrição Creche",
        texto=(
            "Mensagem de teste do serviço de mensageria da Inscrição Creche (SME-Rio).\n\n"
            "Se você recebeu isto, o canal {canal} está funcionando.\n\n"
            "Origem: {origem}"
        ),
        opcionais={"origem": "ambiente de desenvolvimento", "canal": "configurado"},
    ),
    "convocacao_vaga": Template(
        nome="convocacao_vaga",
        assunto="Vaga em creche para {crianca} — confirme até {prazo}",
        texto=(
            "Olá, {responsavel}. Há uma vaga reservada para {crianca}.\n\n"
            "Unidade: {unidade}\n"
            "Turma: {grupamento} ({horario})\n"
            "Confirme até {prazo}\n\n"
            "Para confirmar ou recusar, procure a unidade ou responda esta mensagem. "
            "Se ninguém confirmar até o prazo, a vaga é oferecida à próxima criança da lista."
        ),
        opcionais={"responsavel": "responsável"},
    ),
    "lembrete_prazo": Template(
        nome="lembrete_prazo",
        assunto="Faltam {horas_restantes}h para confirmar a vaga de {crianca}",
        texto=(
            "Olá, {responsavel}. A vaga de {crianca} em {unidade} ainda não foi confirmada.\n\n"
            "Prazo: {prazo} (faltam {horas_restantes} horas)\n\n"
            "Sem a confirmação, a vaga é oferecida à próxima criança da lista."
        ),
        opcionais={"responsavel": "responsável"},
    ),
    "vaga_confirmada": Template(
        nome="vaga_confirmada",
        assunto="Matrícula confirmada para {crianca}",
        texto=(
            "Matrícula de {crianca} confirmada em {unidade}.\n\n"
            "Turma: {grupamento} ({horario})\n"
            "Início: {inicio}\n\n"
            "A unidade entra em contato com as orientações da primeira semana."
        ),
        opcionais={"inicio": "a combinar com a unidade"},
    ),
    "vaga_expirada": Template(
        nome="vaga_expirada",
        assunto="Prazo encerrado para a vaga de {crianca}",
        texto=(
            "O prazo para confirmar a vaga de {crianca} em {unidade} encerrou e a vaga foi "
            "oferecida à próxima criança da lista.\n\n"
            "A inscrição continua ativa: {crianca} segue concorrendo às próximas vagas, "
            "sem perder a classificação."
        ),
    ),
    "pre_cadastro_recebido": Template(
        nome="pre_cadastro_recebido",
        assunto="Pré-cadastro recebido — protocolo {protocolo}",
        texto=(
            "Olá, {responsavel}. O pré-cadastro de {crianca} foi recebido.\n\n"
            "Protocolo: {protocolo}\n\n"
            "Guarde este número. Avisaremos por aqui quando houver vaga. "
            "Se algum telefone ou e-mail mudar, atualize o cadastro — é por ele que a convocação chega."
        ),
        opcionais={"responsavel": "responsável"},
    ),
    # --- painel da creche/EDI: cronograma de verificação de documento (spec/creche/mensageria.md) ---
    "atraso_documento_dia1": Template(
        nome="atraso_documento_dia1",
        assunto="Verificação de documento em atraso — {crianca}",
        texto=(
            "Olá, {responsavel}. A verificação do documento de {crianca} está em atraso há 1 dia.\n\n"
            "Se passarem mais 2 dias sem verificar, {crianca} deixa de contar com os critérios "
            "\"tem irmão na rede\" e \"Pequenos Cariocas\" na pontuação.\n\n"
            "Procure a unidade {unidade} para regularizar."
        ),
        opcionais={"responsavel": "responsável"},
    ),
    "atraso_documento_dia3_perda_criterios": Template(
        nome="atraso_documento_dia3_perda_criterios",
        assunto="Critérios de {crianca} não contam mais na pontuação",
        texto=(
            "Olá, {responsavel}. Como o documento de {crianca} continua sem verificação, os critérios "
            "\"irmão na rede\" e \"Pequenos Cariocas\" não contam mais na pontuação da inscrição.\n\n"
            "Você ainda pode verificar o documento a qualquer momento na unidade {unidade}."
        ),
        opcionais={"responsavel": "responsável"},
    ),
    # --- painel da creche/EDI: cronograma de convocação (comparecimento presencial) ---
    "convocacao_confirmacao_visita": Template(
        nome="convocacao_confirmacao_visita",
        assunto="Confirme a vaga de {crianca} em {unidade}",
        texto=(
            "Olá, {responsavel}! {crianca} foi convocado(a) para a vaga em {unidade}.\n\n"
            "Você vai à unidade confirmar a matrícula presencialmente? Responda SIM ou NÃO.\n\n"
            "O prazo é até {prazo}."
        ),
        opcionais={"responsavel": "responsável"},
    ),
    "convocacao_perda_vaga": Template(
        nome="convocacao_perda_vaga",
        assunto="Vaga de {crianca} liberada por falta de confirmação",
        texto=(
            "Olá, {responsavel}. Como não recebemos a confirmação de presença de {crianca} em "
            "{unidade} dentro do prazo, a vaga foi liberada.\n\n"
            "Vamos tentar uma nova escola para vocês — em breve enviamos uma mensagem perguntando "
            "se ainda têm interesse."
        ),
        opcionais={"responsavel": "responsável"},
    ),
    "reparelhamento_interesse": Template(
        nome="reparelhamento_interesse",
        assunto="Nova vaga encontrada para {crianca}",
        texto=(
            "Olá, {responsavel}. Encontramos uma nova vaga para {crianca} em {nova_unidade}.\n\n"
            "Você ainda tem interesse em vaga na rede municipal? Responda SIM para continuarmos sua "
            "inscrição.\n\n"
            "Se não respondermos até {prazo}, a inscrição será encerrada."
        ),
        opcionais={"responsavel": "responsável"},
    ),
}


def obter(nome: str) -> Template:
    if nome not in TEMPLATES:
        raise KeyError(f"template desconhecido: {nome!r} (disponíveis: {', '.join(sorted(TEMPLATES))})")
    return TEMPLATES[nome]


def catalogo() -> list[dict[str, object]]:
    return [
        {"nome": t.nome, "assunto": t.assunto, "obrigatorios": t.obrigatorios,
         "opcionais": dict(t.opcionais)}
        for t in sorted(TEMPLATES.values(), key=lambda t: t.nome)
    ]
