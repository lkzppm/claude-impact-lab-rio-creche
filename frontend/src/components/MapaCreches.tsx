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
  onSelecionar?: (codigo: string) => void;
  casaAproximada?: boolean;
}

/** Mapa minimalista (CARTO Positron): casa da família, top 5 numerados, demais creches como pontos. */
export default function MapaCreches({ casa, unidades, escolhidas, onSelecionar, casaAproximada }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);
  const onSelecionarRef = useRef(onSelecionar);
  onSelecionarRef.current = onSelecionar;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, dragging: true, tap: true, zoomControl: true, attributionControl: true } as L.MapOptions);
    // OpenStreetMap padrão: sem chave de API (o basemap claro da CARTO passou a exigir uma)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      opacity: 0.55,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    map.setView([-22.91, -43.35], 11);
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
        html: `<span class="mapa-casa-pino"><svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'/><path d='M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/></svg></span><span class="mapa-casa-rotulo">${casaAproximada ? "Sua casa (aprox.)" : "Sua casa"}</span>`,
        iconSize: [120, 30],
        iconAnchor: [15, 15],
      });
      L.marker([casa.lat, casa.lon], { icon: icone, zIndexOffset: 1000, interactive: false }).addTo(camada);
      pontos.push([casa.lat, casa.lon]);
    }

    unidades.forEach((u) => {
      if (u.lat == null || u.lon == null) return;
      const top5 = u.ordem_sugerida <= 5;
      const escolhida = escolhidas.includes(u.codigo);
      let marker: L.Layer;
      if (top5) {
        const icone = L.divIcon({
          className: "mapa-top",
          html: `<span class="mapa-top-n ${escolhida ? "escolhida" : ""}" style="background:${COR_CHANCE[u.chance]}">${u.ordem_sugerida}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        marker = L.marker([u.lat, u.lon], { icon: icone, title: u.nome, zIndexOffset: 500 });
        pontos.push([u.lat, u.lon]);
      } else {
        marker = L.circleMarker([u.lat, u.lon], {
          radius: 5,
          color: escolhida ? "#005e96" : "#ffffff",
          weight: escolhida ? 3 : 1,
          fillColor: "#9aa3ad",
          fillOpacity: 0.9,
        });
      }
      marker.on("click", () => onSelecionarRef.current?.(u.codigo));
      marker.addTo(camada);
    });

    if (pontos.length >= 2) map.fitBounds(L.latLngBounds(pontos), { padding: [32, 32], maxZoom: 15 });
    else if (pontos.length === 1) map.setView(pontos[0], 14);
    setTimeout(() => map.invalidateSize(), 50);
  }, [casa, unidades, escolhidas, casaAproximada]);

  return (
    <div className="mapa-wrap">
      <div ref={ref} className="mapa" role="img" aria-label="Mapa com a sua casa e as creches sugeridas" />
      <p className="mapa-legenda">
        <span>
          <i style={{ background: COR_CHANCE.alta }} />
          Alta
        </span>
        <span>
          <i style={{ background: COR_CHANCE.media }} />
          Média
        </span>
        <span>
          <i style={{ background: COR_CHANCE.baixa }} />
          Baixa
        </span>
        <span>
          <i style={{ background: COR_CHANCE.sem_vaga }} />
          Sem vaga
        </span>
        <span>Toque em uma creche para ver o cartão dela.</span>
      </p>
    </div>
  );
}
