import { useEffect, useMemo, useRef, useState } from "react";
import {
  Baby, Building2, Check, ChevronDown, ChevronUp, Clock, FileCheck, Home, Mail, MapPin, MessageCircle, Phone, Send, Sun, Users, X,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, criarPreCadastro, getGeoCep, getReguaFamilia, getSugestoes, verificarCpf } from "../api/client";
import type { Canal, Contato, GeoCep, PreCadastroCriado, PreCadastroIn, Sugestoes, UnidadeSugerida, Verificacao } from "../api/types";
import { Spinner } from "../design-system";
import MapaCreches, { COR_CHANCE, ROTULO_CHANCE, fmtKm } from "../components/MapaCreches";
import { DOCUMENTOS_BASE, ROTULO_COMPROVACAO, criterioSimples } from "../familia/criterios";

/* Formulário da família — feito para quem tem pouca leitura: frases curtas, uma coisa por vez, botões grandes,
   ícone em tudo. A pontuação da régua NÃO aparece (é conta interna da SME); o que a família precisa saber é
   responder sim/não e quais documentos levar. */

const RASCUNHO_KEY = "creche.precadastro.rascunho";
const MIN_CONTATOS = 3;
const GRUPAMENTOS = ["Berçário", "Maternal I", "Maternal II"] as const;
const PARENTESCOS = ["mãe", "pai", "avó", "avô", "tio(a)", "outro"];
const CANAIS: { v: Canal; rotulo: string; Icone: typeof Phone }[] = [
  { v: "whatsapp", rotulo: "WhatsApp", Icone: MessageCircle },
  { v: "celular", rotulo: "Telefone", Icone: Phone },
  { v: "email", rotulo: "E-mail", Icone: Mail },
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
  contatos: [
    { nome: "", parentesco: "mãe", canal: "whatsapp", valor: "", principal: true },
    { nome: "", parentesco: "pai", canal: "celular", valor: "", principal: false },
    { nome: "", parentesco: "avó", canal: "whatsapp", valor: "", principal: false },
  ],
  escolhas: [],
  cpf: "",
  nomeResponsavel: "",
  consentimento: false,
};

function lerRascunho(): Rascunho {
  try {
    const s = localStorage.getItem(RASCUNHO_KEY);
    if (!s) return VAZIO;
    const r = { ...VAZIO, ...(JSON.parse(s) as Partial<Rascunho>) };
    while (r.contatos.length < MIN_CONTATOS) r.contatos.push({ ...VAZIO.contatos[r.contatos.length], principal: false });
    return r;
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
const fmtDataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso);

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

/** Chance em linguagem simples, sem pontuação e sem porcentagem: "N em cada 10 famílias parecidas". */
function fraseChance(u: UnidadeSugerida): string {
  if (u.chance === "sem_vaga") return "Esta creche não teve vaga para essa idade e turno no ano passado.";
  if (u.taxa_pct == null) return "Poucas famílias parecidas com a sua escolheram esta creche no ano passado. Não dá para estimar.";
  const dez = Math.max(1, Math.round(u.taxa_pct / 10));
  return `No ano passado, ${dez} em cada 10 famílias parecidas com a sua conseguiram vaga aqui.`;
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
  const secEnviar = useRef<HTMLElement>(null);
  const [destacada, setDestacada] = useState<string | null>(null);
  function focarUnidade(codigo: string) {
    setDestacada(codigo);
    const el = document.getElementById(`unidade-${codigo}`);
    const det = el?.closest("details");
    if (det && !det.open) det.open = true;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setDestacada((d) => (d === codigo ? null : d)), 2500);
  }

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
        setGeoErro(g.lat == null || g.lon == null ? "Não achamos esse CEP no mapa." : null);
      })
      .catch((e) => {
        if (!ativo) return;
        setGeo(null);
        setGeoErro(e instanceof ApiError && e.status === 404 ? "CEP errado. Confira os 8 números." : "Não deu para procurar o CEP agora.");
      })
      .finally(() => ativo && setGeoCarregando(false));
    return () => {
      ativo = false;
    };
  }, [cepDigitos]);

  // verificação automática pelo CPF (CadÚnico, Bolsa Família…)
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
      .catch(() => ativo && (setVerif(null), setVerifErro("Não deu para conferir agora. Pode continuar; conferimos depois.")))
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

  // perguntas em linguagem simples, separadas por como são comprovadas
  const perguntas = useMemo(() => {
    const lista = (regua.data?.perguntas ?? []).map((p) => ({ ...p, s: criterioSimples(p.texto) }));
    return {
      automaticas: lista.filter((p) => p.s.comprovacao === "automatica"),
      manuais: lista.filter((p) => p.s.comprovacao !== "automatica"),
    };
  }, [regua.data]);
  const documentosParaLevar = useMemo(() => {
    const extras = perguntas.manuais
      .filter((p) => p.s.comprovacao === "documento" && p.s.documento && respostasEfetivas[String(p.ich_perg_id)])
      .map((p) => p.s.documento as string);
    return [...DOCUMENTOS_BASE, ...extras.filter((d, i, a) => a.indexOf(d) === i && !DOCUMENTOS_BASE.includes(d))];
  }, [perguntas, respostasEfetivas]);

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
    set("contatos", [...r.contatos, { nome: "", parentesco: "outro", canal: "whatsapp", valor: "", principal: false }]);
  }
  function removerContato(i: number) {
    if (r.contatos.length <= MIN_CONTATOS) return;
    const cs = r.contatos.filter((_, k) => k !== i);
    if (!cs.some((c) => c.principal)) cs[0].principal = true;
    set("contatos", cs);
  }
  const contatoOk = (c: Contato) =>
    c.nome.trim().length >= 2 && c.valor.trim().length > 0 && (c.canal === "email" ? emailValido(c.valor) : telefoneValido(c.valor));
  const contatosValidos = r.contatos.filter(contatoOk);

  // validação final — em palavras simples, apontando o passo
  const cepOk = (geo != null && geo.lat != null && geo.lon != null) || (cepDigitos.length === 8 && r.semLocalizacao);
  const pendencias: string[] = [];
  if (!nascAnoMes) pendencias.push("Passo 1: a data de nascimento da criança");
  if (!r.grupamento) pendencias.push("Passo 1: a turma da criança");
  if (!r.horario) pendencias.push("Passo 1: o horário");
  if (!cpfValido(r.cpf)) pendencias.push("Passo 1: o seu CPF");
  if (!cepOk) pendencias.push(cepDigitos.length === 8 ? "Passo 3: confira o CEP (ou marque “continuar mesmo assim”)" : "Passo 3: o CEP da sua casa");
  if (contatosValidos.length < MIN_CONTATOS) pendencias.push("Passo 5: 3 contatos completos, com nome e número");
  if (r.escolhas.length < 1) pendencias.push("Passo 4: escolha pelo menos 1 creche");
  if (r.nomeResponsavel.trim().length < 3) pendencias.push("Passo 6: o seu nome");
  if (!r.consentimento) pendencias.push("Passo 6: marque que autoriza o uso dos dados");

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

  const passosFeitos = [!!nascAnoMes && cpfOk, true, cepOk, r.escolhas.length > 0, contatosValidos.length >= MIN_CONTATOS, r.nomeResponsavel.trim().length >= 3 && r.consentimento];

  /* ---------- sucesso ---------- */
  if (enviado) {
    return (
      <main className="fam pc">
        <div className="fam-wrap">
          <div className="pc-sucesso">
            <span className="pc-sucesso-icone" aria-hidden="true">
              <Check size={36} />
            </span>
            <h1 className="fam-h1">Pronto! Recebemos o seu cadastro.</h1>
          </div>
          <div className="pc-protocolo">
            <span className="pc-protocolo-rotulo">Guarde este código</span>
            <strong className="pc-protocolo-valor">{enviado.protocolo}</strong>
            <span className="pc-protocolo-ajuda">Tire uma foto ou anote. É com ele que você acompanha a vaga.</span>
          </div>

          <section className="fam-sec pc-sec">
            <h2>
              <Building2 size={26} aria-hidden="true" /> Suas creches, na ordem
            </h2>
            <ol className="pc-escolhas-lista">
              {r.escolhas.map((c, i) => (
                <li key={c}>
                  <span className="pc-escolha-n">{i + 1}ª</span>
                  <span className="pc-escolha-nome">{nomeUnidade(c)}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="fam-sec pc-sec">
            <h2>
              <FileCheck size={26} aria-hidden="true" /> O que levar na creche
            </h2>
            <p className="fam-sec-lead">Na data que vier no seu comprovante, leve estes papéis. Sem eles, a sua situação não conta.</p>
            <ul className="pc-docs">
              {documentosParaLevar.map((d) => (
                <li key={d}>
                  <Check size={20} aria-hidden="true" /> {d}
                </li>
              ))}
            </ul>
          </section>

          <p className="fam-nota">Vamos avisar pelo WhatsApp, telefone ou e-mail que você deixou. Se mudar de número, volte aqui e atualize.</p>
          <Link className="btn btn-primary fam-btn" to={`/familia/pre-cadastro/${encodeURIComponent(enviado.protocolo)}`}>
            Ver meu cadastro
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
        <p className="fam-eyebrow">Vaga em creche</p>
        <h1 className="fam-h1">Vamos achar uma creche perto de casa</h1>
        <p className="fam-lead">São 6 passos. Leva uns 5 minutos. Pode parar e voltar depois: o que você preencher fica guardado.</p>

        {/* 1. A criança */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">1</span> A criança
          </h2>
          <label className="fam-label" htmlFor="nascimento">
            Quando a criança nasceu?
          </label>
          <input id="nascimento" type="date" className="fam-input" value={r.nascimento} min={MIN_NASC} max={HOJE} onChange={(e) => set("nascimento", e.target.value)} required />
          {r.nascimento && idade.meses != null && !idade.grupamento && (
            <p className="fam-erro" role="alert">
              Com essa data, a criança não está na idade de creche (de 0 a 3 anos). Confira a data.
            </p>
          )}
          {idade.grupamento && !r.grupamentoManual && (
            <p className="pc-ok">
              <Baby size={20} aria-hidden="true" /> Turma: <strong>{idade.grupamento}</strong>
              <button type="button" className="pc-link" onClick={() => set("grupamentoManual", true)}>
                Mudar
              </button>
            </p>
          )}
          {(r.grupamentoManual || (!idade.grupamento && r.nascimento)) && (
            <fieldset className="pc-radios">
              <legend className="fam-label">Turma</legend>
              {GRUPAMENTOS.map((g) => (
                <label key={g} className={`pc-radio ${r.grupamento === g ? "on" : ""}`}>
                  <input type="radio" name="grupamento" checked={r.grupamento === g} onChange={() => set("grupamento", g)} />
                  {g}
                </label>
              ))}
            </fieldset>
          )}

          <fieldset className="pc-radios">
            <legend className="fam-label">Que horário você precisa?</legend>
            <div className="pc-opcoes-grandes">
              {[
                { v: "Integral", rotulo: "Dia todo", sub: "manhã e tarde", Icone: Sun },
                { v: "Parcial", rotulo: "Meio período", sub: "só manhã ou só tarde", Icone: Clock },
              ].map(({ v, rotulo, sub, Icone }) => (
                <label key={v} className={`pc-opcao-grande ${r.horario === v ? "on" : ""}`}>
                  <input type="radio" name="horario" checked={r.horario === v} onChange={() => set("horario", v)} />
                  <Icone size={28} aria-hidden="true" />
                  <strong>{rotulo}</strong>
                  <small>{sub}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="fam-label" htmlFor="nomeCrianca">
            Nome da criança <span className="pc-opcional">(se quiser)</span>
          </label>
          <input id="nomeCrianca" className="fam-input" value={r.nomeCrianca} onChange={(e) => set("nomeCrianca", e.target.value)} autoComplete="off" />

          <label className="fam-label" htmlFor="cpf">
            O seu CPF (de quem cuida da criança)
          </label>
          <input id="cpf" className="fam-input" inputMode="numeric" placeholder="000.000.000-00" value={r.cpf} onChange={(e) => set("cpf", mascaraCpf(e.target.value))} />
          {r.cpf && cpfDigitos.length === 11 && !cpfOk && <p className="fam-erro">Esse CPF não existe. Confira os números.</p>}
          {cpfOk && verifCarregando && <p className="fam-ajuda">Conferindo o CPF…</p>}
          {cpfOk && verif && !verifCarregando && (
            <p className="pc-ok">
              <Check size={20} aria-hidden="true" /> CPF conferido. Veja o passo 2.
            </p>
          )}
          {cpfOk && verifErro && <p className="fam-erro">{verifErro}</p>}
          {!cpfOk && <p className="fam-ajuda">Com o CPF, a gente confere o CadÚnico e o Bolsa Família sozinho. Você não precisa levar papel disso.</p>}
        </section>

        {/* 2. Sua família */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">2</span> Sua família
          </h2>
          <p className="fam-sec-lead">Responda o que for verdade. Isso ajuda a sua criança a ter prioridade na fila.</p>
          {regua.isLoading && <Spinner label="Carregando as perguntas…" />}
          {regua.isError && <p className="fam-erro">Não deu para carregar as perguntas agora.</p>}
          {regua.data && (
            <>
              <h3 className="pc-h3">
                <Check size={18} aria-hidden="true" /> Conferido pelo CPF
              </h3>
              {!cpfOk && <p className="fam-ajuda">Escreva o CPF no passo 1 para conferir sozinho.</p>}
              {cpfOk && verifCarregando ? (
                <div className="pc-verif-loading" role="status" aria-live="polite">
                  <Spinner label="Conferindo CadÚnico e Bolsa Família…" />
                  <ul className="pc-skeleton" aria-hidden="true">
                    <li />
                    <li />
                  </ul>
                </div>
              ) : (
                <ul className="pc-criterios">
                  {perguntas.automaticas.map((p) => {
                    const v = verif?.verificados.find((x) => x.ich_perg_id === p.ich_perg_id);
                    const estado = !cpfOk || !v ? "aguardando" : v.resultado === "confirmado" ? "sim" : v.resultado === "nao_encontrado" ? "nao" : "erro";
                    return (
                      <li key={p.ich_perg_id}>
                        <div className={`pc-quest pc-quest-auto ${estado === "sim" ? "on" : ""}`}>
                          <span className="pc-quest-icone" aria-hidden="true">
                            <p.s.Icone size={24} />
                          </span>
                          <span className="pc-quest-texto">{p.s.pergunta}</span>
                          <span className="pc-quest-estado">
                            {estado === "aguardando" && <span className="pill pill-neutral">Vamos conferir</span>}
                            {estado === "sim" && <span className="pill pill-ok">Sim, encontramos</span>}
                            {estado === "nao" && <span className="pill pill-neutral">Não encontramos</span>}
                            {estado === "erro" && <span className="pill pill-warn">Conferimos depois</span>}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <h3 className="pc-h3">
                <FileCheck size={18} aria-hidden="true" /> Marque o que for verdade
              </h3>
              <p className="fam-ajuda">
                O que você marcar aqui precisa de <strong>documento</strong>, que você mostra na creche depois. A gente te diz qual.
              </p>
              <ul className="pc-criterios">
                {perguntas.manuais.map((p) => {
                  const k = String(p.ich_perg_id);
                  const on = !!r.respostas[k];
                  return (
                    <li key={k}>
                      <label className={`pc-quest ${on ? "on" : ""}`}>
                        <input type="checkbox" checked={on} onChange={(e) => set("respostas", { ...r.respostas, [k]: e.target.checked })} />
                        <span className="pc-quest-icone" aria-hidden="true">
                          <p.s.Icone size={24} />
                        </span>
                        <span className="pc-quest-texto">
                          {p.s.pergunta}
                          {on && (
                            <span className={`pc-quest-como pc-quest-como-${p.s.comprovacao}`}>
                              {p.s.comprovacao === "documento" ? `Leve na creche: ${p.s.documento}` : ROTULO_COMPROVACAO[p.s.comprovacao]}
                            </span>
                          )}
                        </span>
                        <span className="pc-quest-check" aria-hidden="true">
                          {on ? <Check size={22} /> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* 3. Onde mora */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">3</span> Onde você mora
          </h2>
          <label className="fam-label" htmlFor="cep">
            CEP da sua casa
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
          <p className="fam-ajuda">O CEP está na conta de luz ou de água. Não sabe? Ligue 1746.</p>
          {geoCarregando && <p className="fam-ajuda">Procurando o endereço…</p>}
          {geo && !geoErro && (
            <p className="pc-ok">
              <MapPin size={20} aria-hidden="true" /> {[geo.logradouro, geo.bairro].filter(Boolean).join(", ") || geo.cep}
            </p>
          )}
          {geoErro && (
            <div className="pc-aviso">
              <p>{geoErro}</p>
              {geo && (
                <label className="pc-check">
                  <input type="checkbox" checked={r.semLocalizacao} onChange={(e) => set("semLocalizacao", e.target.checked)} />
                  Continuar mesmo assim (mostramos as creches do bairro)
                </label>
              )}
            </div>
          )}
          <label className="fam-label" htmlFor="cepAlt">
            Outro CEP <span className="pc-opcional">(trabalho, casa da avó — se quiser)</span>
          </label>
          <input id="cepAlt" className="fam-input" inputMode="numeric" placeholder="00000-000" value={r.cepAlternativo} onChange={(e) => set("cepAlternativo", mascaraCep(e.target.value))} />
        </section>

        {/* 4. Creches */}
        <section className="fam-sec pc-sec" ref={secCreches}>
          <h2>
            <span className="pc-num">4</span> Escolha as creches
          </h2>
          <p className="fam-sec-lead">
            Escolha <strong>até 5</strong>. A primeira é a que você mais quer. As de cima são as que têm mais chance perto da sua casa.
          </p>
          {!podeSugerir && <p className="fam-ajuda">Preencha a data de nascimento e o horário (passo 1) para ver as creches.</p>}
          {podeSugerir && cepDigitos.length < 8 && <p className="fam-ajuda">Escreva o CEP (passo 3) para ver as creches perto de casa.</p>}
          {sug.isFetching && !sug.data && <Spinner label="Procurando creches…" />}
          {sug.isError && <p className="fam-erro">Não deu para buscar as creches agora.</p>}

          {unidades.length > 0 && (
            <>
              <MapaCreches casa={casa} unidades={unidades} escolhidas={r.escolhas} onSelecionar={focarUnidade} casaAproximada={casaAproximada} />
              {casaAproximada && (
                <p className="fam-ajuda">
                  <Home size={16} aria-hidden="true" /> A casa no mapa é mais ou menos, pelo bairro.
                </p>
              )}

              {r.escolhas.length > 0 && (
                <div className="pc-escolhas">
                  <h3 className="pc-h3">Suas escolhas ({r.escolhas.length} de 5)</h3>
                  <ol className="pc-escolhas-lista">
                    {r.escolhas.map((c, i) => (
                      <li key={c}>
                        <span className="pc-escolha-n">{i + 1}ª</span>
                        <span className="pc-escolha-nome">{nomeUnidade(c)}</span>
                        <span className="pc-escolha-acoes">
                          <button type="button" aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>
                            <ChevronUp size={18} aria-hidden="true" />
                          </button>
                          <button type="button" aria-label="Descer" onClick={() => mover(i, 1)} disabled={i === r.escolhas.length - 1}>
                            <ChevronDown size={18} aria-hidden="true" />
                          </button>
                          <button type="button" aria-label="Tirar" onClick={() => remover(c)}>
                            <X size={18} aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <ul className="pc-unidades">
                {top5.map((u) => (
                  <CardUnidade key={u.codigo} u={u} escolhida={r.escolhas.includes(u.codigo)} destacada={destacada === u.codigo} cheio={r.escolhas.length >= 5} onEscolher={escolher} onRemover={remover} destaque />
                ))}
              </ul>
              {resto.length > 0 && (
                <details className="pc-mais">
                  <summary>Ver mais creches perto ({resto.length})</summary>
                  <ul className="pc-unidades">
                    {resto.map((u) => (
                      <CardUnidade key={u.codigo} u={u} escolhida={r.escolhas.includes(u.codigo)} destacada={destacada === u.codigo} cheio={r.escolhas.length >= 5} onEscolher={escolher} onRemover={remover} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {podeSugerir && sug.data && unidades.length === 0 && <p className="fam-ajuda">Não achamos creches. Confira o CEP e a data de nascimento.</p>}
        </section>

        {/* 5. Contatos */}
        <section className="fam-sec pc-sec">
          <h2>
            <span className="pc-num">5</span> Como falar com você
          </h2>
          <div className="pc-aviso pc-aviso-forte">
            <Phone size={22} aria-hidden="true" />
            <span>
              Quando sair a vaga, temos <strong>3 dias</strong> para falar com você. Se ninguém atender, a vaga vai para outra criança. Por isso pedimos{" "}
              <strong>3 contatos</strong>.
            </span>
          </div>
          <div className="pc-passos-contato" aria-label={`${Math.min(contatosValidos.length, MIN_CONTATOS)} de ${MIN_CONTATOS} contatos completos`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`pc-passo-contato ${contatosValidos.length > i ? "ok" : ""}`}>
                {contatosValidos.length > i ? <Check size={18} aria-hidden="true" /> : i + 1}
              </span>
            ))}
            <span className="pc-passos-contato-texto">{contatosValidos.length >= MIN_CONTATOS ? "Contatos completos" : `Faltam ${MIN_CONTATOS - contatosValidos.length}`}</span>
          </div>
          <ul className="pc-contatos">
            {r.contatos.map((c, i) => (
              <li key={i} className={`pc-contato ${contatoOk(c) ? "ok" : ""}`}>
                <div className="pc-contato-titulo">
                  <Users size={20} aria-hidden="true" /> Contato {i + 1}
                  {c.principal && <span className="pill pill-info">Principal</span>}
                </div>
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
                </div>
                <div className="pc-canais" role="radiogroup" aria-label="Como falar">
                  {CANAIS.map(({ v, rotulo, Icone }) => (
                    <label key={v} className={`pc-canal ${c.canal === v ? "on" : ""}`}>
                      <input type="radio" name={`canal-${i}`} checked={c.canal === v} onChange={() => setContato(i, { canal: v, valor: "" })} />
                      <Icone size={20} aria-hidden="true" />
                      {rotulo}
                    </label>
                  ))}
                </div>
                <input
                  className="fam-input"
                  aria-label={c.canal === "email" ? "E-mail" : "Número com DDD"}
                  inputMode={c.canal === "email" ? "email" : "tel"}
                  placeholder={c.canal === "email" ? "nome@exemplo.com" : "(21) 99999-9999"}
                  value={c.valor}
                  onChange={(e) => setContato(i, { valor: c.canal === "email" ? e.target.value : mascaraTelefone(e.target.value) })}
                />
                {c.valor && !contatoOk(c) && <p className="fam-erro">{c.canal === "email" ? "Falta um pedaço do e-mail." : "Falta número. Coloque o DDD e o número todo."}</p>}
                <div className="pc-contato-acoes">
                  {!c.principal && (
                    <button type="button" className="pc-link" onClick={() => setContato(i, { principal: true })}>
                      Falar com esta pessoa primeiro
                    </button>
                  )}
                  {r.contatos.length > MIN_CONTATOS && (
                    <button type="button" className="pc-link" onClick={() => removerContato(i)}>
                      Tirar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary fam-btn" onClick={addContato}>
            + Mais um contato
          </button>
        </section>

        {/* 6. Enviar */}
        <section className="fam-sec pc-sec" ref={secEnviar}>
          <h2>
            <span className="pc-num">6</span> Enviar
          </h2>
          <label className="fam-label" htmlFor="nomeResp">
            O seu nome
          </label>
          <input id="nomeResp" className="fam-input" value={r.nomeResponsavel} onChange={(e) => set("nomeResponsavel", e.target.value)} autoComplete="name" />
          <ul className="pc-resumo">
            <li>
              <span>Criança</span>
              <strong>
                {r.nomeCrianca || "—"} · {r.nascimento ? fmtDataBr(r.nascimento) : "—"}
              </strong>
            </li>
            <li>
              <span>Turma e horário</span>
              <strong>
                {r.grupamento || "—"} · {r.horario === "Integral" ? "Dia todo" : "Meio período"}
              </strong>
            </li>
            <li>
              <span>Creches</span>
              <strong>{r.escolhas.length} escolhida{r.escolhas.length === 1 ? "" : "s"}</strong>
            </li>
            <li>
              <span>Contatos</span>
              <strong>{contatosValidos.length}</strong>
            </li>
          </ul>

          {documentosParaLevar.length > DOCUMENTOS_BASE.length && (
            <div className="pc-aviso">
              <p>
                <strong>Você marcou coisas que precisam de documento.</strong> Depois de enviar, mostramos a lista do que levar na creche.
              </p>
            </div>
          )}

          <label className="pc-check pc-consent">
            <input type="checkbox" checked={r.consentimento} onChange={(e) => set("consentimento", e.target.checked)} />
            <span>
              Deixo a Prefeitura usar estes dados <strong>só para a vaga em creche</strong> e conferir minha situação no CadÚnico e no Bolsa Família. Posso pedir para
              ver, corrigir ou apagar meus dados quando quiser.
            </span>
          </label>

          {tentouEnviar && pendencias.length > 0 && (
            <div className="pc-aviso" role="alert">
              <p>
                <strong>Ainda falta:</strong>
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
            <Send size={20} aria-hidden="true" /> {enviar.isPending ? "Enviando…" : "Enviar"}
          </button>
          <p className="fam-rodape">Dúvidas? Vá até a creche ou ligue 1746.</p>
        </section>
      </div>

      {/* barra fixa: onde você está nos 6 passos e atalho para enviar */}
      <div className="pc-barra" aria-live="polite">
        <div className="pc-barra-passos" aria-label={`${passosFeitos.filter(Boolean).length} de 6 passos prontos`}>
          {passosFeitos.map((ok, i) => (
            <span key={i} className={`pc-barra-passo ${ok ? "ok" : ""}`}>
              {ok ? <Check size={14} aria-hidden="true" /> : i + 1}
            </span>
          ))}
        </div>
        <button type="button" className="pc-barra-item pc-barra-btn" onClick={() => secCreches.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <span>Creches</span>
          <strong>{r.escolhas.length}/5</strong>
        </button>
        <button type="button" className="pc-barra-item pc-barra-btn pc-barra-enviar" onClick={() => secEnviar.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <span>Ir para</span>
          <strong>Enviar</strong>
        </button>
      </div>
      <button
        type="button"
        className="pc-limpar"
        onClick={() => {
          if (confirm("Apagar tudo e começar de novo?")) {
            setR(VAZIO);
            setGeo(null);
            navigate("/familia/pre-cadastro");
          }
        }}
      >
        Apagar tudo e começar de novo
      </button>
    </main>
  );
}

function CardUnidade({
  u,
  escolhida,
  destacada,
  cheio,
  onEscolher,
  onRemover,
  destaque,
}: {
  u: UnidadeSugerida;
  escolhida: boolean;
  destacada?: boolean;
  cheio: boolean;
  onEscolher: (c: string) => void;
  onRemover: (c: string) => void;
  destaque?: boolean;
}) {
  return (
    <li id={`unidade-${u.codigo}`} className={`pc-unidade ${destaque ? "destaque" : ""} ${escolhida ? "escolhida" : ""} ${destacada ? "foco" : ""}`}>
      <div className="pc-unidade-topo">
        <span className={`pc-chance pc-chance-${u.chance}`}>
          <i style={{ background: COR_CHANCE[u.chance] }} aria-hidden="true" />
          {ROTULO_CHANCE[u.chance]}
        </span>
        {destaque && (
          <span className="pc-unidade-ordem">
            {u.ordem_sugerida}ª mais perto de você
            {u.chance !== "sem_vaga" && <small> · Com chance de ter vaga</small>}
          </span>
        )}
      </div>
      <div className="pc-unidade-nome">{u.nome}</div>
      <div className="pc-unidade-meta">
        <MapPin size={16} aria-hidden="true" /> {u.bairro ? `${u.bairro} · ` : ""}
        {fmtKm(u.distancia_km)} de casa
      </div>
      <p className="pc-unidade-frase">{fraseChance(u)}</p>
      {escolhida ? (
        <button type="button" className="btn btn-secondary pc-unidade-btn" onClick={() => onRemover(u.codigo)}>
          <Check size={18} aria-hidden="true" /> Escolhida · tirar
        </button>
      ) : (
        <button type="button" className="btn btn-primary pc-unidade-btn" onClick={() => onEscolher(u.codigo)} disabled={cheio || u.chance === "sem_vaga"}>
          {cheio ? "Já tem 5" : "Quero esta"}
        </button>
      )}
    </li>
  );
}
