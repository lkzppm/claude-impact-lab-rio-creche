import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, criarPreCadastro, getGeoCep, getReguaFamilia, getSugestoes, verificarCpf } from "../api/client";
import type { Canal, Contato, GeoCep, PreCadastroCriado, PreCadastroIn, Sugestoes, UnidadeSugerida, Verificacao } from "../api/types";
import { Spinner } from "../design-system";
import MapaCreches, { COR_CHANCE, ROTULO_CHANCE, fmtKm } from "../components/MapaCreches";

const RASCUNHO_KEY = "creche.precadastro.rascunho";
const GRUPAMENTOS = ["Berçário", "Maternal I", "Maternal II"] as const;
const PARENTESCOS = ["mãe", "pai", "avó", "avô", "tio(a)", "outro"];
const CANAIS: { v: Canal; rotulo: string }[] = [
  { v: "celular", rotulo: "Celular" },
  { v: "whatsapp", rotulo: "WhatsApp" },
  { v: "email", rotulo: "E-mail" },
];

interface Rascunho {
  nomeCrianca: string;
  nascimento: string;
  grupamento: string;
  grupamentoManual: boolean;
  horario: string;
  cep: string;
  cepAlternativo: string;
  semLocalizacao: boolean;
  respostas: Record<string, boolean>;
  contatos: Contato[];
  escolhas: string[];
  cpf: string;
  nomeResponsavel: string;
  consentimento: boolean;
}

const VAZIO: Rascunho = {
  nomeCrianca: "",
  nascimento: "",
  grupamento: "",
  grupamentoManual: false,
  horario: "Integral",
  cep: "",
  cepAlternativo: "",
  semLocalizacao: false,
  respostas: {},
  contatos: [{ nome: "", parentesco: "mãe", canal: "celular", valor: "", principal: true }],
  escolhas: [],
  cpf: "",
  nomeResponsavel: "",
  consentimento: false,
};

function lerRascunho(): Rascunho {
  try {
    const s = localStorage.getItem(RASCUNHO_KEY);
    if (!s) return VAZIO;
    return { ...VAZIO, ...(JSON.parse(s) as Partial<Rascunho>) };
  } catch {
    return VAZIO;
  }
}

function salvarRascunho(r: Rascunho) {
  try {
    localStorage.setItem(RASCUNHO_KEY, JSON.stringify(r));
  } catch {
    /* sem storage */
  }
}

/* ---------- utilitários ---------- */
const soDigitos = (s: string) => s.replace(/\D/g, "");
export const mascaraCep = (s: string) => {
  const d = soDigitos(s).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};
export const mascaraCpf = (s: string) => {
  const d = soDigitos(s).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};
export function cpfValido(s: string): boolean {
  const d = soDigitos(s);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const telefoneValido = (s: string) => soDigitos(s).length >= 10;
const mascaraTelefone = (s: string) => {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const anoMes = (data: string) => (/^\d{4}-\d{2}-\d{2}$/.test(data) ? data.slice(0, 7) : "");
const isoData = (d: Date) => d.toISOString().slice(0, 10);
const HOJE = isoData(new Date());
const MIN_NASC = isoData(new Date(new Date().getFullYear() - 4, new Date().getMonth(), new Date().getDate()));

/** Grupamento pela data de nascimento, na data de referência (31/03 do próximo ano letivo). */
function grupamentoPorIdade(nascimento: string): { grupamento: string | null; meses: number | null } {
  const am = anoMes(nascimento);
  if (!am) return { grupamento: null, meses: null };
  const [a, m] = am.split("-").map(Number);
  const hoje = new Date();
  const anoRef = hoje.getMonth() + 1 > 3 ? hoje.getFullYear() + 1 : hoje.getFullYear();
  const meses = (anoRef - a) * 12 + (3 - m);
  if (meses < 0 || meses > 47) return { grupamento: null, meses };
  if (meses < 24) return { grupamento: "Berçário", meses };
  if (meses < 36) return { grupamento: "Maternal I", meses };
  return { grupamento: "Maternal II", meses };
}

function useDebounce<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

function ordinal(n: number) {
  return `${n}º`;
}

function fraseChance(u: UnidadeSugerida, pontos: number, ano: number | undefined): string {
  if (u.chance === "sem_vaga") return "Sem vaga neste grupamento e turno no último processo.";
  if (u.taxa_pct == null) return "Poucos casos parecidos no ano passado para estimar a chance.";
  const rotulo = u.chance === "alta" ? "Boa chance" : u.chance === "media" ? "Chance média" : "Chance baixa";
  const quando = ano ? `no processo de ${ano}` : "no último processo";
  return `${rotulo}: ${quando}, ${Math.round(u.taxa_pct)}% das crianças com até ${pontos} pontos que escolheram esta creche conseguiram vaga (${u.n_base} casos).`;
}

/* ---------- página ---------- */
export default function PreCadastroPage() {
  const navigate = useNavigate();
  const [r, setR] = useState<Rascunho>(() => lerRascunho());
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((old) => ({ ...old, [k]: v }));
  useEffect(() => salvarRascunho(r), [r]);

  const [geo, setGeo] = useState<GeoCep | null>(null);
  const [geoErro, setGeoErro] = useState<string | null>(null);
  const [geoCarregando, setGeoCarregando] = useState(false);
  const [enviado, setEnviado] = useState<PreCadastroCriado | null>(null);
  const [verif, setVerif] = useState<Verificacao | null>(null);
  const [verifErro, setVerifErro] = useState<string | null>(null);
  const [verifCarregando, setVerifCarregando] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const secCreches = useRef<HTMLElement>(null);

  const regua = useQuery({ queryKey: ["familia", "regua"], queryFn: getReguaFamilia, staleTime: 3600_000 });

  // grupamento automático pela idade
  const idade = useMemo(() => grupamentoPorIdade(r.nascimento), [r.nascimento]);
  useEffect(() => {
    if (!r.grupamentoManual && idade.grupamento && idade.grupamento !== r.grupamento) set("grupamento", idade.grupamento);
  }, [idade.grupamento, r.grupamentoManual, r.grupamento]);

  // CEP → geocodificação
  const cepDigitos = soDigitos(r.cep);
  useEffect(() => {
    if (cepDigitos.length !== 8) {
      setGeo(null);
      setGeoErro(null);
      return;
    }
    let ativo = true;
    setGeoCarregando(true);
    getGeoCep(cepDigitos)
      .then((g) => {
        if (!ativo) return;
        setGeo(g);
        setGeoErro(g.lat == null || g.lon == null ? "Não conseguimos localizar esse CEP no mapa." : null);
      })
      .catch((e) => {
        if (!ativo) return;
        setGeo(null);
        setGeoErro(e instanceof ApiError && e.status === 404 ? "CEP inválido. Confira os 8 números." : "Não deu para consultar o CEP agora.");
      })
      .finally(() => ativo && setGeoCarregando(false));
    return () => {
      ativo = false;
    };
  }, [cepDigitos]);

  // verificação automática pelo CPF (CadÚnico, Bolsa Família, Saúde…)
  const cpfDigitos = soDigitos(r.cpf);
  const cpfOk = cpfValido(r.cpf);
  const nascAnoMes = anoMes(r.nascimento);
  useEffect(() => {
    if (!cpfOk) {
      setVerif(null);
      setVerifErro(null);
      return;
    }
    let ativo = true;
    setVerifCarregando(true);
    verificarCpf(cpfDigitos, nascAnoMes || undefined)
      .then((v) => ativo && (setVerif(v), setVerifErro(null)))
      .catch(() => ativo && (setVerif(null), setVerifErro("Não foi possível verificar agora. Você pode continuar; conferimos depois.")))
      .finally(() => ativo && setVerifCarregando(false));
    return () => {
      ativo = false;
    };
  }, [cpfOk, cpfDigitos, nascAnoMes]);

  // respostas efetivas = manuais + automáticas (automática vence quando bloqueia_manual)
  const bloqueadas = useMemo(() => new Set((verif?.verificados ?? []).filter((v) => v.bloqueia_manual).map((v) => String(v.ich_perg_id))), [verif]);
  const respostasEfetivas = useMemo(() => {
    const out: Record<string, boolean> = { ...r.respostas };
    for (const [k, v] of Object.entries(verif?.respostas_automaticas ?? {})) {
      if (bloqueadas.has(k) || v) out[k] = v || !!out[k];
    }
    for (const k of bloqueadas) out[k] = !!verif?.respostas_automaticas[k];
    return out;
  }, [r.respostas, verif, bloqueadas]);

  // sugestões em tempo real (debounce)
  const entradaSugestoes = useMemo(
    () => ({
      cep: cepDigitos,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      grupamento: r.grupamento,
      horario: r.horario,
      respostas: respostasEfetivas,
    }),
    [cepDigitos, geo?.lat, geo?.lon, r.grupamento, r.horario, respostasEfetivas],
  );
  const entradaDeb = useDebounce(entradaSugestoes, 400);
  const podeSugerir = !!entradaDeb.grupamento && !!entradaDeb.horario;
  const sug = useQuery<Sugestoes>({
    queryKey: ["familia", "sugestoes", entradaDeb],
    queryFn: () => getSugestoes(entradaDeb),
    enabled: podeSugerir,
    placeholderData: (prev) => prev,
  });
  const pontos = sug.data?.pontuacao.total ?? pontosLocais(respostasEfetivas, regua.data);
  const maxima = sug.data?.pontuacao.maxima ?? regua.data?.maxima ?? 100;
  const unidades = sug.data?.unidades ?? [];
  const top5 = unidades.slice(0, 5);
  const resto = unidades.slice(5);
  const casa = sug.data?.casa && sug.data.casa.lat != null && sug.data.casa.lon != null ? { lat: sug.data.casa.lat, lon: sug.data.casa.lon } : null;
  const casaAproximada = sug.data?.casa?.fonte === "bairro_centroide";

  // escolhas
  const nomeUnidade = (c: string) => unidades.find((u) => u.codigo === c)?.nome ?? c;
  function escolher(codigo: string) {
    setR((old) => {
      if (old.escolhas.includes(codigo) || old.escolhas.length >= 5) return old;
      return { ...old, escolhas: [...old.escolhas, codigo] };
    });
  }
  function remover(codigo: string) {
    set(
      "escolhas",
      r.escolhas.filter((c) => c !== codigo),
    );
  }
  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= r.escolhas.length) return;
    const e = [...r.escolhas];
    [e[i], e[j]] = [e[j], e[i]];
    set("escolhas", e);
  }

  // contatos
  function setContato(i: number, patch: Partial<Contato>) {
    const cs = r.contatos.map((c, k) => (k === i ? { ...c, ...patch } : c));
    if (patch.principal) cs.forEach((c, k) => (c.principal = k === i));
    set("contatos", cs);
  }
  function addContato() {
    set("contatos", [...r.contatos, { nome: "", parentesco: "pai", canal: "whatsapp", valor: "", principal: false }]);
  }
  function removerContato(i: number) {
    if (r.contatos.length === 1) return;
    const cs = r.contatos.filter((_, k) => k !== i);
    if (!cs.some((c) => c.principal)) cs[0].principal = true;
    set("contatos", cs);
  }
  const contatoOk = (c: Contato) =>
    c.nome.trim().length >= 2 && c.valor.trim().length > 0 && (c.canal === "email" ? emailValido(c.valor) : telefoneValido(c.valor));
  const contatosValidos = r.contatos.filter(contatoOk);

  // validação final
  const cepOk = (geo != null && geo.lat != null && geo.lon != null) || (cepDigitos.length === 8 && r.semLocalizacao);
  const pendencias: string[] = [];
  if (!nascAnoMes) pendencias.push("data de nascimento da criança");
  if (!r.grupamento) pendencias.push("grupamento");
  if (!r.horario) pendencias.push("turno");
  if (!cepOk) pendencias.push(cepDigitos.length === 8 ? "confirme o CEP (ou marque “continuar sem localização”)" : "CEP da casa");
  if (contatosValidos.length < 1) pendencias.push("pelo menos 1 contato completo");
  if (r.escolhas.length < 1) pendencias.push("pelo menos 1 creche escolhida");
  if (!cpfValido(r.cpf)) pendencias.push("CPF do responsável");
  if (r.nomeResponsavel.trim().length < 3) pendencias.push("nome do responsável");
  if (!r.consentimento) pendencias.push("autorização de uso dos dados");

  const enviar = useMutation({
    mutationFn: (body: PreCadastroIn) => criarPreCadastro(body),
    onSuccess: (res) => {
      setEnviado(res);
      try {
        localStorage.removeItem(RASCUNHO_KEY);
      } catch {
        /* ignore */
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  function submeter() {
    setTentouEnviar(true);
    if (pendencias.length) return;
    enviar.mutate({
      cpf: soDigitos(r.cpf),
      nome_responsavel: r.nomeResponsavel.trim(),
      nome_crianca: r.nomeCrianca.trim() || undefined,
      nascimento_anomes: nascAnoMes,
      grupamento: r.grupamento,
      horario: r.horario,
      cep: cepDigitos,
      cep_alternativo: soDigitos(r.cepAlternativo) || undefined,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      respostas: respostasEfetivas,
      verificacoes: verif?.verificados ?? [],
      contatos: contatosValidos.map((c) => ({ ...c, nome: c.nome.trim(), valor: c.valor.trim() })),
      escolhas: r.escolhas,
      consentimento: true,
    });
  }

  /* ---------- sucesso ---------- */
  if (enviado) {
    return (
      <main className="fam">
        <div className="fam-wrap">
          <div className="fam-banner fam-banner-ok">
            <strong>Pré-cadastro enviado!</strong>
            <span>Guarde este código. É com ele que você acompanha tudo por aqui.</span>
          </div>
          <div className="pc-protocolo">
            <span className="pc-protocolo-rotulo">Seu código</span>
            <strong className="pc-protocolo-valor">{enviado.protocolo}</strong>
          </div>
          <section className="fam-sec">
            <h2>Resumo</h2>
            <ul className="pc-resumo">
              <li>
                <span>Pontuação</span>
                <strong>
                  {enviado.pontuacao} de {maxima}
                </strong>
              </li>
              <li>
                <span>Creches escolhidas</span>
                <strong>{enviado.n_escolhas}</strong>
              </li>
              <li>
                <span>Contatos cadastrados</span>
                <strong>{enviado.n_contatos}</strong>
              </li>
            </ul>
            <ol className="pc-escolhas-lista">
              {r.escolhas.map((c) => (
                <li key={c}>{nomeUnidade(c)}</li>
              ))}
            </ol>
          </section>
          <p className="fam-nota">
            Em dezembro, na inscrição oficial no matricula.rio, esses dados já vêm preenchidos. Se algo mudar (endereço, telefone), volte aqui e atualize.
          </p>
          <Link className="btn btn-primary fam-btn" to={`/familia/pre-cadastro/${encodeURIComponent(enviado.protocolo)}`}>
            Ver meu pré-cadastro
          </Link>
          <Link className="btn btn-secondary fam-btn" to="/familia">
            Voltar ao início
          </Link>
        </div>
      </main>
    );
  }

  /* ---------- formulário ---------- */
  return (
    <main className="fam pc">
      <div className="fam-wrap">
        <p className="fam-eyebrow">Pré-cadastro · creche</p>
        <h1 className="fam-h1">Vamos preparar a inscrição da sua criança</h1>
        <p className="fam-lead">
          Leva uns 5 minutos. Conforme você preenche, mostramos a sua pontuação e as creches com mais chance perto de casa.
        </p>

        {/* 1. A criança */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">1</span> A criança
          </h2>
          <label className="fam-label" htmlFor="nomeCrianca">
            Nome da criança <span className="pc-opcional">(opcional)</span>
          </label>
          <input id="nomeCrianca" className="fam-input" value={r.nomeCrianca} onChange={(e) => set("nomeCrianca", e.target.value)} autoComplete="off" />

          <label className="fam-label" htmlFor="nascimento">
            Data de nascimento da criança
          </label>
          <input id="nascimento" type="date" className="fam-input" value={r.nascimento} min={MIN_NASC} max={HOJE} onChange={(e) => set("nascimento", e.target.value)} required />
          {r.nascimento && idade.meses != null && !idade.grupamento && (
            <p className="fam-erro" role="alert">
              Com {idade.meses < 0 ? "essa data" : `${idade.meses} meses`} em 31 de março, a criança fica fora da faixa de creche (0 a 3 anos). Confira a data.
            </p>
          )}
          {idade.grupamento && !r.grupamentoManual && (
            <p className="fam-ajuda">
              Pela idade ({idade.meses} meses em 31/03), o grupamento é <strong>{idade.grupamento}</strong>.{" "}
              <button type="button" className="pc-link" onClick={() => set("grupamentoManual", true)}>
                Mudar
              </button>
            </p>
          )}
          {(r.grupamentoManual || (!idade.grupamento && r.nascimento)) && (
            <fieldset className="pc-radios">
              <legend className="fam-label">Grupamento</legend>
              {GRUPAMENTOS.map((g) => (
                <label key={g} className={`pc-radio ${r.grupamento === g ? "on" : ""}`}>
                  <input type="radio" name="grupamento" checked={r.grupamento === g} onChange={() => set("grupamento", g)} />
                  {g}
                </label>
              ))}
            </fieldset>
          )}
          <fieldset className="pc-radios">
            <legend className="fam-label">Turno</legend>
            {["Integral", "Parcial"].map((h) => (
              <label key={h} className={`pc-radio ${r.horario === h ? "on" : ""}`}>
                <input type="radio" name="horario" checked={r.horario === h} onChange={() => set("horario", h)} />
                {h}
              </label>
            ))}
          </fieldset>

          <label className="fam-label" htmlFor="cpf">
            CPF do responsável
          </label>
          <input id="cpf" className="fam-input" inputMode="numeric" placeholder="000.000.000-00" value={r.cpf} onChange={(e) => set("cpf", mascaraCpf(e.target.value))} />
          {r.cpf && cpfDigitos.length === 11 && !cpfOk && <p className="fam-erro">CPF inválido. Confira os números.</p>}
          {cpfOk && verifCarregando && <p className="fam-ajuda">Consultando as bases do governo…</p>}
          {cpfOk && verif && !verifCarregando && <p className="pc-ok">CPF verificado. Veja no passo 3 o que já foi confirmado automaticamente.</p>}
          {cpfOk && verifErro && <p className="fam-erro">{verifErro}</p>}
          <p className="fam-ajuda">Com o CPF conferimos CadÚnico, Bolsa Família e outros critérios nas bases oficiais — sem papel.</p>
        </section>

        {/* 2. Onde mora */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">2</span> Onde a família mora
          </h2>
          <label className="fam-label" htmlFor="cep">
            CEP da casa
          </label>
          <input
            id="cep"
            className="fam-input"
            inputMode="numeric"
            placeholder="00000-000"
            value={r.cep}
            onChange={(e) => {
              set("cep", mascaraCep(e.target.value));
              set("semLocalizacao", false);
            }}
          />
          {geoCarregando && <p className="fam-ajuda">Procurando o endereço…</p>}
          {geo && !geoErro && (
            <p className="pc-ok">
              Endereço encontrado: {[geo.logradouro, geo.bairro].filter(Boolean).join(", ") || geo.cep}
              {geo.cidade ? ` — ${geo.cidade}` : ""}
            </p>
          )}
          {geoErro && (
            <div className="pc-aviso">
              <p>{geoErro}</p>
              {geo && (
                <label className="pc-check">
                  <input type="checkbox" checked={r.semLocalizacao} onChange={(e) => set("semLocalizacao", e.target.checked)} />
                  Continuar sem localização (mostramos as creches pelo bairro)
                </label>
              )}
            </div>
          )}
          <label className="fam-label" htmlFor="cepAlt">
            Outro endereço de referência <span className="pc-opcional">(trabalho, avó… opcional)</span>
          </label>
          <input id="cepAlt" className="fam-input" inputMode="numeric" placeholder="00000-000" value={r.cepAlternativo} onChange={(e) => set("cepAlternativo", mascaraCep(e.target.value))} />
        </section>

        {/* 3. Situação da família */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">3</span> Situação da família
          </h2>
          {regua.isLoading && <Spinner label="Carregando critérios…" />}
          {regua.isError && <p className="fam-erro">Não deu para carregar os critérios agora.</p>}
          {regua.data && (
            <>
              <h3 className="pc-h3">Verificado automaticamente pelo CPF</h3>
              {!cpfOk && <p className="fam-ajuda">Digite o CPF no passo 1 para verificar automaticamente.</p>}
              {cpfOk && verifCarregando && !verif && <Spinner label="Consultando as bases do governo…" />}
              <ul className="pc-criterios">
                {regua.data.perguntas
                  .filter((p) => p.automatico)
                  .map((p) => {
                    const k = String(p.ich_perg_id);
                    const v = verif?.verificados.find((x) => x.ich_perg_id === p.ich_perg_id);
                    const podeMarcar = v && !v.bloqueia_manual && v.resultado !== "confirmado";
                    const on = !!r.respostas[k];
                    return (
                      <li key={k}>
                        <div className={`pc-crit pc-crit-auto ${v?.resultado === "confirmado" ? "on" : ""}`}>
                          <span className="pc-crit-fonte" aria-hidden="true">
                            {v?.resultado === "confirmado" ? "✓" : "•"}
                          </span>
                          <span className="pc-crit-texto">{p.texto}</span>
                          <span className="pc-crit-pontos">
                            {!cpfOk || !v ? (
                              <span className="pill pill-neutral">{p.pontos} pontos</span>
                            ) : v.resultado === "confirmado" ? (
                              <span className="pill pill-ok">Confirmado · +{p.pontos} pontos</span>
                            ) : v.resultado === "nao_encontrado" ? (
                              <span className="pill pill-neutral">Não consta</span>
                            ) : (
                              <span className="pill pill-warn">Não foi possível verificar agora</span>
                            )}
                          </span>
                        </div>
                        {podeMarcar && (
                          <label className={`pc-crit pc-crit-sub ${on ? "on" : ""}`}>
                            <input type="checkbox" checked={on} onChange={(e) => set("respostas", { ...r.respostas, [k]: e.target.checked })} />
                            <span className="pc-crit-texto">Não consta laudo na Saúde. Se a criança tem laudo, marque e leve o documento na matrícula.</span>
                            <span className="pc-crit-pontos">{p.pontos} pontos</span>
                          </label>
                        )}
                      </li>
                    );
                  })}
              </ul>

              <h3 className="pc-h3">Conte-nos o resto</h3>
              <p className="fam-ajuda">Estes critérios ainda não têm base oficial para conferir automaticamente; serão comprovados na matrícula.</p>
              <ul className="pc-criterios">
                {regua.data.perguntas
                  .filter((p) => !p.automatico && !p.desempate)
                  .map((p) => {
                    const k = String(p.ich_perg_id);
                    const on = !!r.respostas[k];
                    return (
                      <li key={k}>
                        <label className={`pc-crit ${on ? "on" : ""}`}>
                          <input type="checkbox" checked={on} onChange={(e) => set("respostas", { ...r.respostas, [k]: e.target.checked })} />
                          <span className="pc-crit-texto">{p.texto}</span>
                          <span className="pc-crit-pontos">{p.pontos} pontos</span>
                        </label>
                      </li>
                    );
                  })}
              </ul>
              {regua.data.perguntas.some((p) => p.desempate) && (
                <>
                  <h3 className="pc-h3">Critérios de desempate</h3>
                  <p className="fam-ajuda">Não dão pontos, mas decidem em caso de empate.</p>
                  <ul className="pc-criterios">
                    {regua.data.perguntas
                      .filter((p) => p.desempate)
                      .map((p) => {
                        const k = String(p.ich_perg_id);
                        const on = !!r.respostas[k];
                        return (
                          <li key={k}>
                            <label className={`pc-crit ${on ? "on" : ""}`}>
                              <input type="checkbox" checked={on} onChange={(e) => set("respostas", { ...r.respostas, [k]: e.target.checked })} />
                              <span className="pc-crit-texto">{p.texto}</span>
                              <span className="pc-crit-pontos">desempate</span>
                            </label>
                          </li>
                        );
                      })}
                  </ul>
                </>
              )}
            </>
          )}
          <div className="pc-pontos-inline">
            Sua pontuação agora: <strong>{pontos}</strong> de {maxima}
          </div>
        </section>

        {/* 4. Contatos */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">4</span> Contatos
          </h2>
          <div className="pc-aviso pc-aviso-forte">
            Se não conseguirmos falar com você em 3 dias, a vaga passa para outra criança. Cadastre <strong>mais de uma pessoa</strong> e{" "}
            <strong>mais de um canal</strong>.
          </div>
          {contatosValidos.length < 2 && (
            <span className="pill pill-warn">
              {contatosValidos.length === 0 ? "Falta pelo menos 1 contato completo" : "Só 1 contato — adicione outro para garantir"}
            </span>
          )}
          {contatosValidos.length >= 2 && <span className="pill pill-ok">{contatosValidos.length} contatos — ótimo</span>}
          <ul className="pc-contatos">
            {r.contatos.map((c, i) => (
              <li key={i} className="pc-contato">
                <div className="pc-contato-grid">
                  <label>
                    <span className="fam-label">Nome</span>
                    <input className="fam-input" value={c.nome} onChange={(e) => setContato(i, { nome: e.target.value })} autoComplete="off" />
                  </label>
                  <label>
                    <span className="fam-label">Quem é</span>
                    <select className="fam-input" value={c.parentesco} onChange={(e) => setContato(i, { parentesco: e.target.value })}>
                      {PARENTESCOS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="fam-label">Canal</span>
                    <select className="fam-input" value={c.canal} onChange={(e) => setContato(i, { canal: e.target.value as Canal, valor: "" })}>
                      {CANAIS.map((k) => (
                        <option key={k.v} value={k.v}>
                          {k.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="fam-label">{c.canal === "email" ? "E-mail" : "Número"}</span>
                    <input
                      className="fam-input"
                      inputMode={c.canal === "email" ? "email" : "tel"}
                      placeholder={c.canal === "email" ? "nome@exemplo.com" : "(21) 99999-9999"}
                      value={c.valor}
                      onChange={(e) => setContato(i, { valor: c.canal === "email" ? e.target.value : mascaraTelefone(e.target.value) })}
                    />
                  </label>
                </div>
                {c.valor && !contatoOk(c) && <p className="fam-erro">{c.canal === "email" ? "E-mail incompleto." : "Número incompleto (DDD + número)."}</p>}
                <div className="pc-contato-acoes">
                  <label className="pc-check">
                    <input type="radio" name="principal" checked={c.principal} onChange={() => setContato(i, { principal: true })} />
                    Contato principal
                  </label>
                  {r.contatos.length > 1 && (
                    <button type="button" className="pc-link" onClick={() => removerContato(i)}>
                      Remover
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary fam-btn" onClick={addContato}>
            + Adicionar outro contato
          </button>
        </section>

        {/* 5. Creches */}
        <section className="fam-sec pc-sec" ref={secCreches}>
          <h2>
            <span className="pc-num">5</span> Creches para você
          </h2>
          <p className="fam-sec-lead">
            Você escolhe <strong>até 5</strong>, em ordem de preferência. A sugestão é só uma ajuda — a escolha é sua.
          </p>
          {!podeSugerir && <p className="fam-ajuda">Preencha o nascimento e o turno para ver as creches.</p>}
          {podeSugerir && !casa && cepDigitos.length === 8 && !geoCarregando && (
            <p className="fam-ajuda">Sem localização, mostrando por bairro.</p>
          )}
          {podeSugerir && cepDigitos.length < 8 && <p className="fam-ajuda">Informe o CEP para ver as creches perto de casa.</p>}
          {sug.isFetching && !sug.data && <Spinner label="Procurando creches…" />}
          {sug.isError && <p className="fam-erro">Não deu para buscar as creches agora.</p>}

          {unidades.length > 0 && (
            <>
              <MapaCreches casa={casa} unidades={unidades} escolhidas={r.escolhas} onEscolher={escolher} casaAproximada={casaAproximada} />
              {casaAproximada && <p className="fam-ajuda">🏠 Localização aproximada pelo bairro.</p>}
              {sug.isFetching && <p className="fam-ajuda">Atualizando…</p>}

              {r.escolhas.length > 0 && (
                <div className="pc-escolhas">
                  <h3 className="pc-h3">Minhas escolhas ({r.escolhas.length} de 5)</h3>
                  <ol className="pc-escolhas-lista">
                    {r.escolhas.map((c, i) => (
                      <li key={c}>
                        <span className="pc-escolha-n">{i + 1}ª</span>
                        <span className="pc-escolha-nome">{nomeUnidade(c)}</span>
                        <span className="pc-escolha-acoes">
                          <button type="button" aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>
                            ▲
                          </button>
                          <button type="button" aria-label="Descer" onClick={() => mover(i, 1)} disabled={i === r.escolhas.length - 1}>
                            ▼
                          </button>
                          <button type="button" aria-label="Remover" onClick={() => remover(c)}>
                            ✕
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <ul className="pc-unidades">
                {top5.map((u) => (
                  <CardUnidade key={u.codigo} u={u} pontos={pontos} ano={sug.data?.regua_ano} escolhida={r.escolhas.includes(u.codigo)} cheio={r.escolhas.length >= 5} onEscolher={escolher} onRemover={remover} destaque />
                ))}
              </ul>
              {resto.length > 0 && (
                <details className="pc-mais">
                  <summary>Ver mais creches perto ({resto.length})</summary>
                  <ul className="pc-unidades">
                    {resto.map((u) => (
                      <CardUnidade key={u.codigo} u={u} pontos={pontos} ano={sug.data?.regua_ano} escolhida={r.escolhas.includes(u.codigo)} cheio={r.escolhas.length >= 5} onEscolher={escolher} onRemover={remover} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {podeSugerir && sug.data && unidades.length === 0 && (
            <p className="fam-ajuda">Ainda sem creches para mostrar. Confira o CEP e o grupamento.</p>
          )}
        </section>

        {/* 6. Confirmar */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">6</span> Confirmar
          </h2>
          <label className="fam-label" htmlFor="nomeResp">
            Nome do responsável
          </label>
          <input id="nomeResp" className="fam-input" value={r.nomeResponsavel} onChange={(e) => set("nomeResponsavel", e.target.value)} autoComplete="name" />
          <ul className="pc-resumo">
            <li>
              <span>CPF do responsável</span>
              <strong>{cpfOk ? r.cpf : "— (preencha no passo 1)"}</strong>
            </li>
            <li>
              <span>Criança</span>
              <strong>
                {r.nomeCrianca || "—"} · {r.nascimento || "—"} · {r.grupamento || "—"} · {r.horario}
              </strong>
            </li>
            <li>
              <span>Pontuação</span>
              <strong>
                {pontos} de {maxima}
              </strong>
            </li>
          </ul>

          <label className="pc-check pc-consent">
            <input type="checkbox" checked={r.consentimento} onChange={(e) => set("consentimento", e.target.checked)} />
            <span>
              Autorizo a Secretaria Municipal de Educação a usar estes dados <strong>só para a classificação e a convocação de vaga em creche</strong>, inclusive
              conferindo os critérios nas bases oficiais (CadÚnico, Bolsa Família, Receita). São dados de criança: você pode pedir acesso, correção ou exclusão a
              qualquer momento (LGPD, art. 14).
            </span>
          </label>

          {tentouEnviar && pendencias.length > 0 && (
            <div className="pc-aviso" role="alert">
              <p>
                <strong>Falta preencher:</strong>
              </p>
              <ul>
                {pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {enviar.isError && (
            <p className="fam-erro" role="alert">
              Não deu para enviar: {enviar.error instanceof Error ? enviar.error.message : "erro desconhecido"}
            </p>
          )}
          <button type="button" className="btn btn-primary fam-btn" onClick={submeter} disabled={enviar.isPending}>
            {enviar.isPending ? "Enviando…" : "Enviar pré-cadastro"}
          </button>
          <p className="fam-rodape">Dúvidas? Procure a unidade escolar ou ligue 1746.</p>
        </section>
      </div>

      {/* barra fixa com a pontuação ao vivo */}
      <div className="pc-barra" aria-live="polite">
        <div className="pc-barra-item">
          <span>Sua pontuação</span>
          <strong>
            {pontos} <small>de {maxima}</small>
          </strong>
        </div>
        <button type="button" className="pc-barra-item pc-barra-btn" onClick={() => secCreches.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <span>Top 5 para você</span>
          <strong>{top5.length > 0 ? `${top5.length} creche${top5.length === 1 ? "" : "s"}` : "—"}</strong>
        </button>
        <div className="pc-barra-item">
          <span>Escolhidas</span>
          <strong>{r.escolhas.length}/5</strong>
        </div>
      </div>
      <button type="button" className="pc-limpar" onClick={() => { if (confirm("Apagar tudo e começar de novo?")) { setR(VAZIO); setGeo(null); navigate("/familia/pre-cadastro"); } }}>
        Começar de novo
      </button>
    </main>
  );
}

function pontosLocais(respostas: Record<string, boolean>, regua: { perguntas: { ich_perg_id: number; pontos: number; desempate: boolean }[] } | undefined): number {
  if (!regua) return 0;
  return regua.perguntas.filter((p) => !p.desempate && respostas[String(p.ich_perg_id)]).reduce((s, p) => s + p.pontos, 0);
}

function CardUnidade({
  u,
  pontos,
  ano,
  escolhida,
  cheio,
  onEscolher,
  onRemover,
  destaque,
}: {
  u: UnidadeSugerida;
  pontos: number;
  ano: number | undefined;
  escolhida: boolean;
  cheio: boolean;
  onEscolher: (c: string) => void;
  onRemover: (c: string) => void;
  destaque?: boolean;
}) {
  return (
    <li className={`pc-unidade ${destaque ? "destaque" : ""} ${escolhida ? "escolhida" : ""}`}>
      <div className="pc-unidade-topo">
        {destaque && <span className="pc-unidade-ordem">{ordinal(u.ordem_sugerida)} sugerido</span>}
        <span className="pill" style={{ background: COR_CHANCE[u.chance], color: "#fff" }}>
          {ROTULO_CHANCE[u.chance]}
        </span>
      </div>
      <div className="pc-unidade-nome">{u.nome}</div>
      <div className="pc-unidade-meta">
        {u.bairro ? `${u.bairro} · ` : ""}
        {fmtKm(u.distancia_km)} · vagas: {u.vagas}
      </div>
      <p className="pc-unidade-frase">{fraseChance(u, pontos, ano)}</p>
      {escolhida ? (
        <button type="button" className="btn btn-secondary pc-unidade-btn" onClick={() => onRemover(u.codigo)}>
          ✓ Escolhida — remover
        </button>
      ) : (
        <button type="button" className="btn btn-primary pc-unidade-btn" onClick={() => onEscolher(u.codigo)} disabled={cheio || u.chance === "sem_vaga"}>
          {cheio ? "Já tem 5 escolhas" : "Escolher"}
        </button>
      )}
    </li>
  );
}
