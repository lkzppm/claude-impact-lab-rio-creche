import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiError, getPreCadastro } from "../api/client";
import { Spinner, fmtDateTime } from "../design-system";
import { fmtKm } from "../components/MapaCreches";

const CANAL: Record<string, string> = { celular: "Celular", whatsapp: "WhatsApp", email: "E-mail" };

export default function PreCadastroProtocoloPage() {
  const { protocolo = "" } = useParams();
  const q = useQuery({ queryKey: ["familia", "pre-cadastro", protocolo], queryFn: () => getPreCadastro(protocolo), enabled: !!protocolo, retry: false });

  if (q.isLoading) {
    return (
      <main className="fam">
        <div className="fam-wrap">
          <Spinner label="Buscando seu pré-cadastro…" />
        </div>
      </main>
    );
  }
  if (q.isError || !q.data) {
    const naoAchou = q.error instanceof ApiError && q.error.status === 404;
    return (
      <main className="fam">
        <div className="fam-wrap">
          <h1 className="fam-h1">{naoAchou ? "Não encontramos esse pré-cadastro" : "Não foi possível consultar agora"}</h1>
          <p className="fam-lead">{naoAchou ? `Confira o código "${protocolo}".` : "Tente novamente em alguns minutos."}</p>
          <Link className="btn btn-primary fam-btn" to="/familia/pre-cadastro">
            Fazer um pré-cadastro
          </Link>
          <Link className="btn btn-secondary fam-btn" to="/familia">
            Voltar ao início
          </Link>
        </div>
      </main>
    );
  }
  const d = q.data;
  return (
    <main className="fam">
      <div className="fam-wrap">
        <p className="fam-eyebrow">Pré-cadastro · {fmtDateTime(d.criado_em)}</p>
        <h1 className="fam-h1">{d.nome_crianca ? `Pré-cadastro de ${d.nome_crianca}` : "Seu pré-cadastro"}</h1>
        <div className="pc-protocolo">
          <span className="pc-protocolo-rotulo">Seu código</span>
          <strong className="pc-protocolo-valor">{d.protocolo}</strong>
        </div>

        <section className="fam-sec">
          <h2>A criança</h2>
          <ul className="pc-resumo">
            <li>
              <span>Nascimento</span>
              <strong>{d.nascimento_anomes}</strong>
            </li>
            <li>
              <span>Grupamento</span>
              <strong>{d.grupamento}</strong>
            </li>
            <li>
              <span>Turno</span>
              <strong>{d.horario}</strong>
            </li>
            <li>
              <span>Endereço</span>
              <strong>
                CEP {d.cep}
                {d.bairro ? ` · ${d.bairro}` : ""}
              </strong>
            </li>
          </ul>
        </section>

        <section className="fam-sec">
          <h2>Sua pontuação</h2>
          <p className="fam-pontos">
            <strong>{d.pontuacao}</strong> pontos pela régua vigente. Os critérios marcados serão conferidos nas bases do governo.
          </p>
        </section>

        <section className="fam-sec">
          <h2>Creches escolhidas</h2>
          <ol className="pc-escolhas-lista">
            {d.escolhas
              .slice()
              .sort((a, b) => a.ordem - b.ordem)
              .map((e) => (
                <li key={e.codigo}>
                  <span className="pc-escolha-n">{e.ordem}ª</span>
                  <span className="pc-escolha-nome">
                    {e.nome ?? e.codigo}
                    <small>
                      {e.bairro ? ` · ${e.bairro}` : ""}
                      {e.distancia_km != null ? ` · ${fmtKm(e.distancia_km)}` : ""}
                    </small>
                  </span>
                </li>
              ))}
          </ol>
        </section>

        <section className="fam-sec">
          <h2>Contatos</h2>
          <ul className="pc-resumo">
            {d.contatos.map((c, i) => (
              <li key={i}>
                <span>
                  {c.nome} ({c.parentesco}){c.principal ? " · principal" : ""}
                </span>
                <strong>
                  {CANAL[c.canal] ?? c.canal}: {c.valor}
                </strong>
              </li>
            ))}
          </ul>
        </section>

        <p className="fam-nota">Responsável: {d.nome_responsavel}. Em dezembro, na inscrição oficial no matricula.rio, esses dados já vêm preenchidos.</p>
        <Link className="btn btn-secondary fam-btn" to="/familia">
          Voltar ao início
        </Link>
        <p className="fam-rodape">Dúvidas? Procure a unidade escolar ou ligue 1746.</p>
      </div>
    </main>
  );
}
