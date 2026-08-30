/** Critérios da régua em linguagem simples + como cada um é comprovado.
 *
 * A régua (Res. SME 542/2025, Art. 6º) e o Art. 7º ("critérios não comprovados deixam de ser computados") são
 * norma: a pontuação não aparece para a família — só o que ela precisa saber: responder e, quando for o caso,
 * levar o documento à creche na comprovação presencial (spec/01-contexto-e-legislacao.md, §1 e §3).
 *
 *   automatica  cruzado pelo CPF nas bases oficiais (RMI/Conecta): CadÚnico, Bolsa Família — sem papel
 *   documento   só vale com documento apresentado na unidade, na data do comprovante
 *   sme         a própria SME confere no sistema de matrícula — sem papel
 *
 * O texto da pergunta vem da base (muda a cada ano); o casamento é por palavra-chave, com fallback genérico. */
import type { LucideIcon } from "lucide-react";
import {
  Accessibility, Activity, Baby, BadgeCheck, Globe, HeartPulse, Hourglass, Lock, ShieldAlert, UserRound, Users, Wallet, Wine,
} from "lucide-react";

export type Comprovacao = "automatica" | "documento" | "sme";

export interface CriterioSimples {
  /** pergunta em linguagem simples, para responder sim/não */
  pergunta: string;
  Icone: LucideIcon;
  comprovacao: Comprovacao;
  /** o que levar na creche (quando comprovacao = documento) */
  documento?: string;
}

const REGRAS: { chaves: string[]; c: CriterioSimples }[] = [
  { chaves: ["cadúnico", "cadunico", "cadastro único"], c: { pergunta: "Sua família está no CadÚnico?", Icone: BadgeCheck, comprovacao: "automatica" } },
  { chaves: ["bolsa fam", "cartão carioca", "cartao carioca"], c: { pergunta: "Sua família recebe Bolsa Família ou tem Cartão Carioca?", Icone: Wallet, comprovacao: "automatica" } },
  { chaves: ["educação especial", "educacao especial", "deficiência da criança"], c: { pergunta: "A criança tem deficiência ou precisa de atendimento especial?", Icone: Accessibility, comprovacao: "documento", documento: "Laudo médico da criança" } },
  { chaves: ["pequenos cariocas"], c: { pergunta: "A criança está no programa Pequenos Cariocas?", Icone: Baby, comprovacao: "sme" } },
  { chaves: ["violência", "violencia"], c: { pergunta: "Alguém da família sofre violência em casa?", Icone: ShieldAlert, comprovacao: "documento", documento: "Boletim de ocorrência ou medida protetiva" } },
  { chaves: ["monoparental"], c: { pergunta: "A criança é criada só pela mãe ou só pelo pai?", Icone: UserRound, comprovacao: "documento", documento: "Certidão de nascimento da criança" } },
  { chaves: ["pais ou responsáveis deficientes", "responsáveis deficientes", "responsáveis com deficiência", "responsavel com deficiencia"], c: { pergunta: "A mãe, o pai ou o responsável tem deficiência?", Icone: Accessibility, comprovacao: "documento", documento: "Laudo médico do responsável" } },
  { chaves: ["doenças crônicas", "doencas cronicas", "doença crônica", "doenca cronica"], c: { pergunta: "Alguém da casa tem doença grave, com tratamento contínuo?", Icone: HeartPulse, comprovacao: "documento", documento: "Laudo ou atestado médico" } },
  { chaves: ["drogas", "álcool", "alcool", "alcoól", "alcoolismo"], c: { pergunta: "Alguém da casa tem problema com álcool ou drogas?", Icone: Wine, comprovacao: "documento", documento: "Declaração de acompanhamento (CAPS ou posto de saúde)" } },
  { chaves: ["presidiário", "presidiario", "privado de liberdade"], c: { pergunta: "Alguém da família está preso ou saiu da prisão nos últimos 5 anos?", Icone: Lock, comprovacao: "documento", documento: "Declaração da unidade prisional ou da Justiça" } },
  { chaves: ["refugiad"], c: { pergunta: "A criança é refugiada (a família veio de outro país)?", Icone: Globe, comprovacao: "documento", documento: "Documento de refugiado (CONARE) ou RNM" } },
  { chaves: ["fila de espera", "lista de espera"], c: { pergunta: "A criança ficou na fila no ano passado sem conseguir vaga?", Icone: Hourglass, comprovacao: "sme" } },
  { chaves: ["irmão", "irmao"], c: { pergunta: "A criança tem irmão em creche ou escola da Prefeitura?", Icone: Users, comprovacao: "sme" } },
  { chaves: ["menor que 18", "menores de 18", "menor de 18"], c: { pergunta: "A mãe ou o pai tem menos de 18 anos?", Icone: Activity, comprovacao: "documento", documento: "Identidade do responsável" } },
];

const GENERICO: CriterioSimples = { pergunta: "", Icone: BadgeCheck, comprovacao: "documento", documento: "Documento que comprove a situação" };

export function criterioSimples(texto: string): CriterioSimples {
  const t = texto.toLowerCase();
  for (const r of REGRAS) if (r.chaves.some((k) => t.includes(k))) return r.c;
  return { ...GENERICO, pergunta: texto };
}

/** Documentos que toda família leva na matrícula (Res. 542/2025, spec/01 §3), antes dos específicos. */
export const DOCUMENTOS_BASE = [
  "Certidão de nascimento da criança",
  "CPF da criança e do responsável",
  "Identidade do responsável",
  "Carteira de vacinação",
  "Comprovante de endereço",
];

export const ROTULO_COMPROVACAO: Record<Comprovacao, string> = {
  automatica: "Conferimos pelo CPF",
  documento: "Leve o documento na creche",
  sme: "A SME confere no sistema",
};
