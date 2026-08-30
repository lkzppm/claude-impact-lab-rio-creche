/**
 * "Me leva até lá": o assistente apontou um card do painel (`data-secao`, ver backend/app/agente/secoes.py).
 * A página de destino pode ainda estar buscando dados, então primeiro esperamos o elemento aparecer; depois
 * rolamos até ele com animação e o destacamos por alguns segundos.
 */

export function acharSecao(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-secao="${CSS.escape(id)}"]`);
}

/** Resolve com o elemento assim que ele existir no DOM, ou `null` depois de `timeoutMs`. */
export function esperarSecao(id: string, timeoutMs = 10_000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const ja = acharSecao(id);
    if (ja) {
      resolve(ja);
      return;
    }
    let timer = 0;
    const obs = new MutationObserver(() => {
      const el = acharSecao(id);
      if (el) {
        obs.disconnect();
        window.clearTimeout(timer);
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    timer = window.setTimeout(() => {
      obs.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * A página de destino pode ainda estar buscando dados: os cards de cima aparecem depois e empurram o alvo para
 * baixo. Espera os spinners da página sumirem e a posição do card ficar parada por ~0,4 s (no máximo `maxMs`).
 */
export async function esperarAssentar(el: HTMLElement, maxMs = 4000): Promise<void> {
  const t0 = performance.now();
  let ultimoTop = Number.NaN;
  let paradoHa = 0;
  while (performance.now() - t0 < maxMs) {
    await new Promise((r) => window.setTimeout(r, 120));
    const top = el.getBoundingClientRect().top;
    const carregando = document.querySelector("main .spinner") !== null;
    paradoHa = !carregando && top === ultimoTop ? paradoHa + 120 : 0;
    if (paradoHa >= 360) return;
    ultimoTop = top;
  }
}

/** Rola a página até o card e resolve quando a rolagem termina (ou logo depois, onde não há `scrollend`). */
export async function rolarAte(el: HTMLElement): Promise<void> {
  await esperarAssentar(el);
  await rolar(el);
  // a página ainda pode ter mudado durante a rolagem: confere e corrige de uma vez, sem animação
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.top > window.innerHeight * 0.8) {
    const alto = r.height > window.innerHeight * 0.7;
    el.scrollIntoView({ behavior: "auto", block: alto ? "start" : "center" });
  }
}

function rolar(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      window.removeEventListener("scrollend", fim);
      resolve();
    };
    window.addEventListener("scrollend", fim, { once: true });
    // card alto (tabela): alinha pelo topo para o título ficar à vista; card baixo: centraliza
    const alto = el.getBoundingClientRect().height > window.innerHeight * 0.7;
    el.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: alto ? "start" : "center" });
    // já visível → não há rolagem nem `scrollend`; nem todo navegador dispara o evento
    window.setTimeout(fim, reduzir ? 50 : 1200);
  });
}

/** Anel azul pulsando por ~3 s (CSS `.secao-destaque`). Reinicia se o mesmo card for apontado de novo. */
export function destacarSecao(el: HTMLElement): void {
  el.classList.remove("secao-destaque");
  void el.offsetWidth;
  el.classList.add("secao-destaque");
  const limpar = () => el.classList.remove("secao-destaque");
  el.addEventListener("animationend", limpar, { once: true });
  window.setTimeout(limpar, 4000);
}
