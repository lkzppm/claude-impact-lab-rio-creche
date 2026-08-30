import { Baby, Landmark, School, Users } from "lucide-react";
import { Link } from "react-router-dom";

const PERFIS = [
  {
    to: "/familia",
    titulo: "Sou família",
    chamada: "Acompanhar minha inscrição",
    texto: "Veja se sua criança tem vaga reservada, sua posição na fila e responda à convocação pelo celular.",
    Icone: Users,
  },
  {
    to: "/cre",
    titulo: "Sou da CRE / polo",
    chamada: "Convocações do meu território",
    texto: "Veja o que está parado, registre contatos e desfechos de cada vaga. Nada se perde: tudo fica com data e hora.",
    Icone: School,
  },
  {
    to: "/sme",
    titulo: "Sou do Nível Central SME",
    chamada: "Visão da rede",
    texto: "Acompanhe o motor de classificação, as 11 CREs, o mapa do território e a régua de pontuação.",
    Icone: Landmark,
  },
  {
    to: "/creche",
    titulo: "Sou da creche / EDI",
    chamada: "Gestão da minha unidade",
    texto: "Vagas por grupamento, crianças convocadas para a unidade e conferência de documentos dos responsáveis.",
    Icone: Baby,
  },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <div className="container">
        <header className="landing-head">
          <h1>Inscrição Creche</h1>
          <p>
            Um só sistema, quatro jeitos de usar. Escolha o seu perfil — não precisa de senha nesta versão de demonstração.
          </p>
        </header>
        <ul className="perfil-grid">
          {PERFIS.map((p) => (
            <li key={p.to}>
              <Link to={p.to} className="perfil-card">
                <span className="perfil-icone" aria-hidden="true">
                  <p.Icone size={40} strokeWidth={1.75} />
                </span>
                <span className="perfil-titulo">{p.titulo}</span>
                <span className="perfil-chamada">{p.chamada}</span>
                <span className="perfil-texto">{p.texto}</span>
                <span className="perfil-cta">Entrar →</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="landing-nota">
          Secretaria Municipal de Educação do Rio de Janeiro · protótipo do Claude Impact Lab Rio #2. A pontuação segue a Res.
          SME 542/2025; o sistema não altera quem tem prioridade.
        </p>
      </div>
    </main>
  );
}
