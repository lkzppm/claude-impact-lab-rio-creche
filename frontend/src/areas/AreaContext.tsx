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

interface AreaCtx {
  area: Area;
  /** prefixo das rotas da área atual ("/cre", "/sme", "/familia" ou "") */
  base: string;
  /** CRE selecionada na área da CRE (string "1".."11"; "" = nenhuma) */
  cre: string;
  setCre: (v: string) => void;
}

const Ctx = createContext<AreaCtx>({ area: null, base: "", cre: "", setCre: () => {} });

export function AreaProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [sp, setSp] = useSearchParams();
  const area = areaFromPath(pathname);
  const [cre, setCreState] = useState<string>(readCre);

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

  const value = useMemo<AreaCtx>(
    () => ({ area, base: area ? `/${area}` : "", cre: area === "cre" ? cre : "", setCre }),
    [area, cre, setCre],
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
