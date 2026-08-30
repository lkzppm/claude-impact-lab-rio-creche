/** Base comum dos mapas (Família, CRE e Nível Central): mesmo provedor de tiles, mesmas cores, mesma moldura.
 *
 * Provedor padrão: Esri Light Gray Canvas (base + rótulos) — claro, minimalista, sem chave e sem marca d'água
 * (o CARTO Positron passou a carimbar "API KEY REQUIRED"). Para outro provedor, defina VITE_MAP_TILES_URL
 * (com a chave na URL, se houver) e VITE_MAP_ATTRIBUTION no .env. */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { VizTone } from "../design-system/viz";

/** Cores dos marcadores = tons semânticos do design system (tokens.css / viz). */
export const COR_TOM: Record<VizTone, string> = {
  ok: "#1e7f4f",
  info: "#028fbe",
  warn: "#b7791f",
  danger: "#b8421a",
  neutral: "#9a9a9a",
};
/** Azul do matricula.rio, usado no contorno do item selecionado em todos os mapas. */
export const COR_SELECAO = "#005e96";

export const RIO: L.LatLngExpression = [-22.91, -43.35];

export function criarMapa(el: HTMLElement, opts: L.MapOptions = {}): L.Map {
  const map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, ...opts });
  const tilesUrl = import.meta.env.VITE_MAP_TILES_URL;
  if (tilesUrl) {
    L.tileLayer(tilesUrl, {
      maxZoom: 19,
      subdomains: tilesUrl.includes("{s}") ? (import.meta.env.VITE_MAP_SUBDOMAINS || "abcd") : "",
      attribution: import.meta.env.VITE_MAP_ATTRIBUTION || "",
    }).addTo(map);
  } else {
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
    const base = { maxNativeZoom: 16, maxZoom: 18, attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors" };
    L.tileLayer(`${esri}World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, base).addTo(map);
    L.tileLayer(`${esri}World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { ...base, attribution: "", pane: "overlayPane" }).addTo(map);
  }
  return map;
}

/** Bolha padrão dos mapas: preenchimento pelo tom, contorno branco; azul e mais grosso quando selecionada. */
export function estiloBolha(tom: VizTone, selecionada = false, raio = 6): L.CircleMarkerOptions {
  return {
    radius: raio,
    color: selecionada ? COR_SELECAO : "#ffffff",
    weight: selecionada ? 3 : 1.5,
    fillColor: COR_TOM[tom],
    fillOpacity: 0.8,
  };
}
