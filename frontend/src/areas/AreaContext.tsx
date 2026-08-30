import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

/** As três áreas do produto. `null` = página de escolha de perfil. */
export type Area = "familia" | "cre" | "sme" | null;

export const AREA_LABEL: Record<Exclude<Area, null>, string> = {
  familia: "Família",
  cre: "CRE / polo",
  sme: "Nível Central SME",
};

const CRE_KEY = "creche.cre";
const ATOR_KEY = "creche.ator";

function areaFromPath(pathname: string): Area {
  if (pathname === "/familia" || pathname.startsWith("/familia/")) return "familia";
  if (pathname === "/cre" || pathname.startsWith("/cre/")) return "cre";
  if (pathname === "/sme" || pathname.startsWith("/sme/")) return "sme";
  return null;
}

function readCre(): string {
  try {
    return localStorage.getItem(CRE_KEY) ?? "";
  } catch {
    return "";
  }
}

function readAtor(): string {
  try {
    return localStorage.getItem(ATOR_KEY) ?? "";
  } catch {
    return "";
  }
}

interface AreaCtx {
  area: Area;
  /** prefixo das rotas da área atual ("/cre", "/sme", "/familia" ou "") */
  base: string;
  /** CRE selecionada na área da CRE (string "1".."11"; "" = nenhuma) */
  cre: string;
  setCre: (v: string) => void;
  /** quem está registrando (nome/matrícula); vai como `ator` no log de eventos. "" = anônimo ("polo") */
  ator: string;
  setAtor: (v: string) => void;
}

const Ctx = createContext<AreaCtx>({ area: null, base: "", cre: "", setCre: () => {}, ator: "", setAtor: () => {} });

export function AreaProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [sp, setSp] = useSearchParams();
  const area = areaFromPath(pathname);
  const [cre, setCreState] = useState<string>(readCre);
  const [ator, setAtorState] = useState<string>(readAtor);

  // `/cre?cre=4` (vindo da visão da rede) pré-seleciona a CRE e limpa o parâmetro
  useEffect(() => {
    const fromUrl = sp.get("cre");
    if (area === "cre" && fromUrl && fromUrl !== cre) {
      setCreState(fromUrl);
      try {
        localStorage.setItem(CRE_KEY, fromUrl);
      } catch {
        /* sem storage */
      }
      const next = new URLSearchParams(sp);
      next.delete("cre");
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, sp]);

  const setCre = useCallback((v: string) => {
    setCreState(v);
    try {
      if (v) localStorage.setItem(CRE_KEY, v);
      else localStorage.removeItem(CRE_KEY);
    } catch {
      /* sem storage */
    }
  }, []);

  const setAtor = useCallback((v: string) => {
    const limpo = v.trim().slice(0, 80);
    setAtorState(limpo);
    try {
      if (limpo) localStorage.setItem(ATOR_KEY, limpo);
      else localStorage.removeItem(ATOR_KEY);
    } catch {
      /* sem storage */
    }
  }, []);

  const value = useMemo<AreaCtx>(
    () => ({ area, base: area ? `/${area}` : "", cre: area === "cre" ? cre : "", setCre, ator, setAtor }),
    [area, cre, setCre, ator, setAtor],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useArea(): AreaCtx {
  return useContext(Ctx);
}

/** prefixo para montar links internos da área atual */
export function useBase(): string {
  return useContext(Ctx).base;
}
