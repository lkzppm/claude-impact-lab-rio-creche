import { Link } from "react-router-dom";

const PERFIS = [
  {
    to: "/familia",
    titulo: "Sou família",
    chamada: "Acompanhar minha inscrição",
    texto: "Veja se sua criança tem vaga reservada, sua posição na fila e responda à convocação pelo celular.",
    icone: "👨‍👩‍👧",
  },
  {
    to: "/cre",
    titulo: "Sou da CRE / polo",
    chamada: "Convocações do meu território",
    texto: "Veja o que está parado, registre contatos e desfechos de cada vaga. Nada se perde: tudo fica com data e hora.",
    icone: "🏫",
  },
  {
    to: "/sme",
    titulo: "Sou do Nível Central SME",
    chamada: "Classificação e rede",
    texto: "Rode a classificação por criança, compare regimes, acompanhe as 11 CREs e consulte a régua de pontuação.",
    icone: "🏛️",
  },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <div className="container">
        <header className="landing-head">
          <h1>Inscrição Creche</h1>
          <p>
            Um só sistema, três jeitos de usar. Escolha o seu perfil — não precisa de senha nesta versão de demonstração.
          </p>
        </header>
        <ul className="perfil-grid">
          {PERFIS.map((p) => (
            <li key={p.to}>
              <Link to={p.to} className="perfil-card">
                <span className="perfil-icone" aria-hidden="true">
                  {p.icone}
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
