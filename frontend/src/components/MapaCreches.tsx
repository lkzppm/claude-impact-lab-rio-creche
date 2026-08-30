import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Chance, UnidadeSugerida } from "../api/types";

export const COR_CHANCE: Record<Chance, string> = {
  alta: "#1e7f4f",
  media: "#b7791f",
  baixa: "#8a8a8a",
  sem_vaga: "#c9c9c9",
};

export const ROTULO_CHANCE: Record<Chance, string> = {
  alta: "Boa chance",
  media: "Chance média",
  baixa: "Chance baixa",
  sem_vaga: "Sem vaga",
};

export function fmtKm(km: number | null | undefined): string {
  if (km == null) return "distância não calculada";
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

interface Props {
  casa: { lat: number; lon: number } | null;
  unidades: UnidadeSugerida[];
  escolhidas: string[];
  onEscolher?: (codigo: string) => void;
  casaAproximada?: boolean;
}

/** Mapa OpenStreetMap com a casa da família e as creches sugeridas (top 5 em destaque). */
export default function MapaCreches({ casa, unidades, escolhidas, onEscolher, casaAproximada }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);
  const onEscolherRef = useRef(onEscolher);
  onEscolherRef.current = onEscolher;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.setView([-22.91, -43.35], 11); // Rio de Janeiro
    camadaRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      camadaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const camada = camadaRef.current;
    if (!map || !camada) return;
    camada.clearLayers();
    const pontos: L.LatLngExpression[] = [];

    if (casa) {
      const icone = L.divIcon({
        className: "mapa-casa",
        html: `<span class="mapa-casa-pino">🏠</span><span class="mapa-casa-rotulo">${casaAproximada ? "Sua casa (aprox.)" : "Sua casa"}</span>`,
        iconSize: [80, 44],
        iconAnchor: [16, 40],
      });
      L.marker([casa.lat, casa.lon], { icon: icone, zIndexOffset: 1000 }).addTo(camada);
      pontos.push([casa.lat, casa.lon]);
    }

    unidades.forEach((u) => {
      if (u.lat == null || u.lon == null) return;
      const top5 = u.ordem_sugerida <= 5;
      const escolhida = escolhidas.includes(u.codigo);
      const marker = L.circleMarker([u.lat, u.lon], {
        radius: top5 ? 11 : 7,
        color: escolhida ? "#005e96" : "#ffffff",
        weight: escolhida ? 3 : 1.5,
        fillColor: COR_CHANCE[u.chance],
        fillOpacity: 0.95,
      });
      const pos = escolhidas.indexOf(u.codigo);
      marker.bindPopup(
        `<div class="mapa-popup"><strong>${u.nome}</strong><br/>${fmtKm(u.distancia_km)} · vagas: ${u.vagas}` +
          `<br/><span style="color:${COR_CHANCE[u.chance]};font-weight:600">${ROTULO_CHANCE[u.chance]}</span>` +
          (pos >= 0 ? `<br/><em>Sua ${pos + 1}ª escolha</em>` : "") +
          (onEscolherRef.current && pos < 0 && u.chance !== "sem_vaga"
            ? `<br/><button type="button" class="mapa-popup-btn" data-codigo="${u.codigo}">Escolher</button>`
            : "") +
          `</div>`,
      );
      marker.on("popupopen", (e) => {
        const el = (e.popup.getElement() as HTMLElement | null)?.querySelector<HTMLButtonElement>(".mapa-popup-btn");
        el?.addEventListener("click", () => {
          onEscolherRef.current?.(u.codigo);
          map.closePopup();
        });
      });
      marker.addTo(camada);
      if (top5) pontos.push([u.lat, u.lon]);
    });

    if (pontos.length >= 2) map.fitBounds(L.latLngBounds(pontos), { padding: [28, 28], maxZoom: 15 });
    else if (pontos.length === 1) map.setView(pontos[0], 14);
    setTimeout(() => map.invalidateSize(), 50);
  }, [casa, unidades, escolhidas, casaAproximada]);

  return (
    <div className="mapa-wrap">
      <div ref={ref} className="mapa" role="img" aria-label="Mapa com a sua casa e as creches sugeridas" />
      <div className="mapa-legenda">
        <span>
          <i style={{ background: COR_CHANCE.alta }} /> Boa chance
        </span>
        <span>
          <i style={{ background: COR_CHANCE.media }} /> Chance média
        </span>
        <span>
          <i style={{ background: COR_CHANCE.baixa }} /> Chance baixa
        </span>
        <span>
          <i style={{ background: COR_CHANCE.sem_vaga }} /> Sem vaga
        </span>
        <span>🏠 Sua casa</span>
      </div>
    </div>
  );
}
