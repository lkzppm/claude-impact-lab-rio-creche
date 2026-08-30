import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { DOCUMENTOS_BASE, criterioSimples } from "../familia/criterios";
import { ApiError, getPreCadastro, getReguaFamilia } from "../api/client";
import { Spinner, fmtDateTime } from "../design-system";
import { fmtKm } from "../components/MapaCreches";

const CANAL: Record<string, string> = { celular: "Telefone", whatsapp: "WhatsApp", email: "E-mail" };

export default function PreCadastroProtocoloPage() {
  const { protocolo = "" } = useParams();
  const q = useQuery({ queryKey: ["familia", "pre-cadastro", protocolo], queryFn: () => getPreCadastro(protocolo), enabled: !!protocolo, retry: false });
  const regua = useQuery({ queryKey: ["familia", "regua"], queryFn: getReguaFamilia, staleTime: 3600_000 });

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
  // documentos a levar: os de toda família + os dos critérios marcados que só valem com papel
  const extras = (regua.data?.perguntas ?? [])
    .filter((p) => d.respostas[String(p.ich_perg_id)])
    .map((p) => criterioSimples(p.texto))
    .filter((c) => c.comprovacao === "documento" && c.documento)
    .map((c) => c.documento as string);
  const documentos = [...DOCUMENTOS_BASE, ...extras.filter((x, i, a) => a.indexOf(x) === i && !DOCUMENTOS_BASE.includes(x))];
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
              <strong>{d.nascimento_anomes.split("-").reverse().join("/")}</strong>
            </li>
            <li>
              <span>Turma</span>
              <strong>{d.grupamento}</strong>
            </li>
            <li>
              <span>Horário</span>
              <strong>{d.horario === "Integral" ? "Dia todo" : "Meio período"}</strong>
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
          <h2>O que levar na creche</h2>
          <p className="fam-sec-lead">Na data que vier no seu comprovante, leve estes papéis. Sem eles, a sua situação não conta.</p>
          <ul className="pc-docs">
            {documentos.map((doc) => (
              <li key={doc}>
                <Check size={20} aria-hidden="true" /> {doc}
              </li>
            ))}
          </ul>
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

        <p className="fam-nota">Responsável: {d.nome_responsavel}. Vamos avisar pelos contatos que você deixou. Se mudar de número, faça o cadastro de novo.</p>
        <Link className="btn btn-secondary fam-btn" to="/familia">
          Voltar ao início
        </Link>
        <p className="fam-rodape">Dúvidas? Vá até a creche ou ligue 1746.</p>
      </div>
    </main>
  );
}
