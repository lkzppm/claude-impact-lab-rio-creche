import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardList, KeyRound } from "lucide-react";
import { FASE, FASE_INFO } from "../familia/fase";

export const CODIGO_KEY = "creche.familia.codigo";

export function lerCodigoSalvo(): string {
  try {
    return localStorage.getItem(CODIGO_KEY) ?? "";
  } catch {
    return "";
  }
}

export function salvarCodigo(c: string) {
  try {
    localStorage.setItem(CODIGO_KEY, c);
  } catch {
    /* sem storage */
  }
}

export function FormularioCodigo({ inicial = "", erro }: { inicial?: string; erro?: string }) {
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState(inicial);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const c = codigo.trim();
    if (!c) return;
    salvarCodigo(c);
    navigate(`/familia/inscricao?codigo=${encodeURIComponent(c)}`);
  }

  return (
    <form className="fam-form" onSubmit={enviar}>
      <label htmlFor="codigo" className="fam-label">
        Digite o código da inscrição
      </label>
      <input
        id="codigo"
        name="codigo"
        className="fam-input"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="ex.: aluno_0000123"
        autoComplete="off"
        inputMode="text"
        required
      />
      {erro && (
        <p className="fam-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="btn btn-primary fam-btn">
        Ver minha inscrição
      </button>
      <p className="fam-ajuda">
        O código está no comprovante da inscrição. Na versão definitiva, você entra com o CPF do responsável validado pelo
        gov.br — sem código para decorar.
      </p>
    </form>
  );
}

export default function FamiliaPage() {
  const fase = FASE_INFO[FASE];
  return (
    <main className="fam">
      <div className="fam-wrap">
        <div className={`fam-fase fam-fase-${FASE}`} role="status">
          <span className="fam-fase-rotulo">Agora estamos em</span>
          <strong>{fase.rotulo}</strong>
          <span className="fam-fase-frase">{fase.frase}</span>
        </div>

        <h1 className="fam-h1">Vaga em creche para a sua criança</h1>

        {/* quem ainda não tem cadastro — é a maioria; vem primeiro e grande */}
        <section className="fam-sec fam-cta">
          <h2>
            <ClipboardList size={26} aria-hidden="true" /> Ainda não fiz o cadastro
          </h2>
          <p className="fam-sec-lead">Leva uns 5 minutos. Você vê as creches perto de casa com mais chance para a sua criança.</p>
          <Link className="btn btn-primary fam-btn fam-btn-grande" to="/familia/pre-cadastro">
            {fase.botao} <ArrowRight size={22} aria-hidden="true" />
          </Link>
        </section>

        {/* quem já tem código */}
        <section className="fam-sec">
          <h2>
            <KeyRound size={26} aria-hidden="true" /> Já tenho um código
          </h2>
          <p className="fam-sec-lead">Veja se já tem vaga reservada, em que lugar da fila está e responda à convocação por aqui.</p>
          <FormularioCodigo inicial={lerCodigoSalvo()} />
        </section>

        <p className="fam-rodape">Dúvidas? Vá até a creche ou ligue 1746.</p>
      </div>
    </main>
  );
}
