"""Seed de demonstração: classifica, convoca e simula alguns dias de convocação — cada transição com
carimbo de tempo, passando pelas MESMAS funções que a API usa (`app/routers/convocacoes.py`).

Uso:  cd backend && python -m app.etl.seed_demo [--ano 2025] [--grupamento "Berçário"] [--horario Integral]
                                                 [--todos] [--dias 5] [--seed 1] [--limpar]

Exige a carga das bases (`make load`). Recusa-se a rodar se já houver convocações, salvo com `--limpar`
(zera rodadas, alocações, convocações, eventos e comprovações; as bases da SME ficam intactas).

O que ele produz (PRD §9: "o painel é demonstrado sobre eventos simulados e isso é dito na banca"):
- uma rodada com 1 vaga por criança (comparação) e uma com 3 reservas + 2 alternativas (a da demo);
- uma convocação por vaga reservada, criadas ao longo dos últimos `--dias` dias;
- para cada criança, um sorteio determinístico do que aconteceu: nada ainda · tentativas de contato ·
  família avisada (e depois confirmou, recusou ou ainda não respondeu) · recusa direta;
- parte das convocações vencidas registradas como `expirada` pelo polo — o resto fica "vencida" no painel.
"""
from __future__ import annotations

import argparse
import random
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text

from app.db import get_sessionmaker
from app.models import Alocacao, Convocacao, Processo
from app.routers import classificacao
from app.routers.convocacoes import ABERTAS, _aplicar_transicao, _criar_convocacao, _registrar_selecao, _tz
from app.schemas import RodadaIn

OPERACAO = ["comprovacao", "evento", "convocacao", "alocacao", "rodada"]
CANAIS = ["whatsapp", "ligacao", "sms"]
OBS_TENTATIVA = ["caixa postal", "não atendeu", "número não existe mais", "mensagem enviada, sem resposta"]
OBS_RECUSA = ["já conseguiu vaga em outra rede", "mudou de bairro", "prefere esperar a 1ª opção"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ano", type=int, default=None, help="padrão: o maior ano carregado")
    ap.add_argument("--grupamento", default="Berçário")
    ap.add_argument("--horario", default="Integral")
    ap.add_argument("--todos", action="store_true", help="todos os grupamentos e turnos (mais lento)")
    ap.add_argument("--dias", type=float, default=5, help="janela de dias em que as convocações foram criadas")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--vagas-presas", type=int, default=3)
    ap.add_argument("--sem-comparacao", action="store_true", help="não roda a rodada de 1 vaga por criança")
    ap.add_argument("--limpar", action="store_true", help="zera as tabelas de operação antes")
    args = ap.parse_args(argv)
    rnd = random.Random(args.seed)
    t_ini = time.time()

    db = get_sessionmaker()()
    ano = args.ano or db.scalar(select(func.max(Processo.ano)))
    if not ano:
        print("[seed] nenhum processo carregado — rode `make load` antes")
        return 1
    n_conv = db.scalar(select(func.count()).select_from(Convocacao)) or 0
    if n_conv and not args.limpar:
        print(f"[seed] já existem {n_conv:,} convocações; use --limpar para zerar as tabelas de operação")
        return 1
    if args.limpar:
        db.execute(text("TRUNCATE " + ", ".join(OPERACAO) + " RESTART IDENTITY CASCADE"))
        db.commit()
        print("[seed] tabelas de operação zeradas")

    grup = None if args.todos else args.grupamento
    hor = None if args.todos else args.horario
    agora = datetime.now(timezone.utc)

    # 1. rodadas (a de 1 vaga entra antes para a de 3 reservas ser a "última", que o painel usa)
    if not args.sem_comparacao:
        r1 = classificacao.executar(RodadaIn(ano=ano, grupamento=grup, horario=hor, tipo="inicial", vagas_presas=1, alternativas=2), db)
        print(f"[seed] rodada #{r1.id} — 1 vaga por criança: {r1.resumo['n_criancas_com_alguma_presa']:,} crianças com oferta, "
              f"{r1.resumo['n_lista_espera']:,} em lista de espera")
    r3 = classificacao.executar(RodadaIn(ano=ano, grupamento=grup, horario=hor, tipo="inicial",
                                         vagas_presas=args.vagas_presas, alternativas=2), db)
    print(f"[seed] rodada #{r3.id} — {args.vagas_presas} reservas por criança: {r3.resumo['n_criancas_com_alguma_presa']:,} crianças "
          f"com oferta, média {r3.resumo['media_presas_por_crianca']} reservas, {r3.resumo['n_lista_espera']:,} em lista de espera")

    # 2. convocações com datas espalhadas pela janela
    db.scalars(select(Alocacao).where(Alocacao.rodada_id == r3.id)).all()          # aquece o identity map
    presas = db.scalars(select(Alocacao).where(Alocacao.rodada_id == r3.id, Alocacao.status == "alocada",
                                               Alocacao.tipo == "presa").order_by(Alocacao.inscricao_id, Alocacao.id)).all()
    por_crianca: dict[int, list[Alocacao]] = defaultdict(list)
    for a in presas:
        por_crianca[a.inscricao_id].append(a)
    inicio: dict[int, datetime] = {}
    convs: dict[int, list[Convocacao]] = {}
    for iid, lst in por_crianca.items():
        t = agora - timedelta(days=rnd.uniform(0, args.dias))
        inicio[iid] = t
        convs[iid] = [_criar_convocacao(db, a, t) for a in lst]
    db.flush()
    for iid, lst in convs.items():
        for c in lst:
            _registrar_selecao(db, c, inicio[iid], r3.id)
    db.flush()
    print(f"[seed] {len(presas):,} convocações para {len(convs):,} crianças, criadas ao longo de {args.dias:g} dias")

    # 3. o que aconteceu com cada criança
    cont: Counter = Counter()
    for iid, lst in convs.items():
        t = inicio[iid]
        alvo = lst[0] if rnd.random() < 0.7 else rnd.choice(lst)   # a família tende a responder pela melhor opção
        canal = rnd.choice(CANAIS)
        sorteio = rnd.random()
        tt = t
        if sorteio < 0.35:
            cont["nada ainda"] += 1
            continue
        if sorteio < 0.60:                                          # só tentativas de contato
            for _ in range(rnd.randint(1, 3)):
                tt += timedelta(hours=rnd.uniform(4, 20))
                if tt > agora:
                    break
                _aplicar_transicao(db, alvo, "contato_tentado", "polo",
                                   {"canal": canal, "observacao": rnd.choice(OBS_TENTATIVA)}, tt)
            cont["tentativas sem resposta"] += 1
        elif sorteio < 0.90:                                        # família avisada
            for _ in range(rnd.randint(0, 2)):
                tt += timedelta(hours=rnd.uniform(3, 18))
                if tt > agora:
                    break
                _aplicar_transicao(db, alvo, "contato_tentado", "polo", {"canal": canal}, tt)
            tt += timedelta(hours=rnd.uniform(2, 24))
            if tt > agora:
                cont["tentativas sem resposta"] += 1
                continue
            _aplicar_transicao(db, alvo, "contato_confirmado", "polo", {"canal": canal, "observacao": "falou com o responsável"}, tt)
            desfecho = rnd.random()
            t2 = tt + timedelta(hours=rnd.uniform(1, 60))
            if t2 > agora or desfecho >= 0.75:
                cont["avisada, aguardando"] += 1
                continue
            pela_familia = rnd.random() < 0.5
            ator = "familia" if pela_familia else "polo"
            payload = {"canal": "painel_familia" if pela_familia else canal}
            if desfecho < 0.55:
                _aplicar_transicao(db, alvo, "confirmada", ator, payload, t2)
                cont["confirmadas"] += 1
            else:
                _aplicar_transicao(db, alvo, "recusada", ator, {**payload, "observacao": rnd.choice(OBS_RECUSA)}, t2)
                cont["recusadas"] += 1
        else:                                                       # recusa direta, no primeiro contato
            tt += timedelta(hours=rnd.uniform(2, 30))
            if tt > agora:
                cont["nada ainda"] += 1
                continue
            _aplicar_transicao(db, alvo, "recusada", "polo", {"canal": canal, "observacao": rnd.choice(OBS_RECUSA)}, tt)
            cont["recusadas"] += 1
    db.flush()

    # 4. o polo já registrou parte das vencidas há mais de um dia; o resto aparece como "vencida" no painel
    vencidas = db.scalars(select(Convocacao).where(Convocacao.status.in_(ABERTAS),
                                                   Convocacao.prazo_fim < agora - timedelta(hours=24))).all()
    n_exp = 0
    for c in vencidas:
        if rnd.random() < 0.4:
            quando = min(agora, _tz(c.prazo_fim) + timedelta(hours=rnd.uniform(2, 20)))
            _aplicar_transicao(db, c, "expirada", "polo", {"motivo": "prazo_vencido"}, quando)
            n_exp += 1
    db.commit()

    por_status = dict(db.execute(select(Convocacao.status, func.count()).group_by(Convocacao.status)).all())
    print("[seed] histórias:", ", ".join(f"{k} {v:,}" for k, v in sorted(cont.items())), f"; expiradas registradas {n_exp:,}")
    print("[seed] convocações por status:", ", ".join(f"{k} {v:,}" for k, v in sorted(por_status.items())))
    print(f"[seed] concluído em {time.time() - t_ini:.0f}s — abra /cre e escolha uma CRE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
