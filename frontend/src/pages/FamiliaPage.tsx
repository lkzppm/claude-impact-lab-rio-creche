import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
  return (
    <main className="fam">
      <div className="fam-wrap">
        <h1 className="fam-h1">Acompanhe a inscrição da sua criança</h1>
        <p className="fam-lead">Veja se já tem vaga reservada, em que posição da fila está e responda à convocação por aqui.</p>
        <FormularioCodigo inicial={lerCodigoSalvo()} />
        <div className="fam-banner fam-banner-info">
          <strong>Ainda não tem inscrição?</strong>
          <span>Faça o cadastro: em 5 minutos você vê as creches com mais chance perto de casa.</span>
          <Link className="btn btn-primary fam-btn" to="/familia/pre-cadastro">
            Ainda não tenho inscrição — fazer pré-cadastro
          </Link>
        </div>
        <p className="fam-rodape">Dúvidas? Procure a unidade escolar ou ligue 1746.</p>
      </div>
    </main>
  );
}
