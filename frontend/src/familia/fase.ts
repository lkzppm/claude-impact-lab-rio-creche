/** Em que fase o painel da família está. Vem de VITE_FASE_FAMILIA (docker-compose/.env):
 *   pre-cadastro  antes da inscrição oficial: a família prepara os dados e vê as creches (padrão)
 *   cadastro      inscrição oficial aberta (matricula.rio): o que foi preparado vira inscrição */
export type FaseFamilia = "pre-cadastro" | "cadastro";

const bruto = (import.meta.env.VITE_FASE_FAMILIA || "pre-cadastro").toString().trim().toLowerCase();
export const FASE: FaseFamilia = bruto === "cadastro" ? "cadastro" : "pre-cadastro";

export const FASE_INFO: Record<FaseFamilia, { rotulo: string; frase: string; botao: string }> = {
  "pre-cadastro": {
    rotulo: "Pré-cadastro",
    frase: "A inscrição oficial ainda não abriu. Você já pode deixar tudo pronto: quando abrir, seus dados vão preenchidos.",
    botao: "Fazer meu pré-cadastro agora",
  },
  cadastro: {
    rotulo: "Cadastro aberto",
    frase: "A inscrição oficial está aberta. Faça agora para a sua criança entrar na fila.",
    botao: "Fazer meu cadastro agora",
  },
};
