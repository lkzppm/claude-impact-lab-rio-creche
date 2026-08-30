import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapaCre, MapaUnidade } from "../api/types";
import type { VizTone } from "../design-system/viz";

/** Campos que CRE e unidade têm em comum — as métricas leem daqui e servem aos dois níveis. */
export interface Territorio {
  vagas: number;
  inscricoes: number;
  alocadas: number;
  lista_espera: number;
  convocadas: number;
  abertas: number;
  confirmadas: number;
  em_atraso: number;
}

export const COR_TOM: Record<VizTone, string> = {
  ok: "#1e7f4f",
  info: "#028fbe",
  warn: "#c98500",
  danger: "#b8421a",
  neutral: "#9a9a9a",
};

export interface Metrica {
  key: string;
  label: string;
  hint: string;
  /** valor que ordena a lista e, por padrão, dimensiona a bolha (sempre ≥ 0) */
  valor: (t: Territorio) => number;
  /** tamanho da bolha, quando a métrica é uma razão: área = quantidade, cor = intensidade */
  tamanho?: (t: Territorio) => number;
  /** o que a bolha mede, para a legenda (quando difere da métrica) */
  tamanhoLabel?: string;
  formato: (t: Territorio) => string;
  tom: (t: Territorio) => VizTone;
  legenda: { label: string; tone: VizTone }[];
}

const num = (n: number) => n.toLocaleString("pt-BR");
const razao = (t: Territorio) => (t.vagas > 0 ? t.inscricoes / t.vagas : 0);

export const METRICAS: Metrica[] = [
  {
    key: "pressao",
    label: "Pressão da fila",
    hint: "inscrições de 1ª opção para cada vaga — onde a demanda mais passa da oferta",
    valor: razao,
    tamanho: (t) => t.inscricoes,     // bolha = tamanho da demanda; cor = quantas por vaga
    tamanhoLabel: "inscrições de 1ª opção",
    formato: (t) =>
      t.vagas > 0 ? `${razao(t).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× (${num(t.inscricoes)} para ${num(t.vagas)} vagas)` : "sem vaga estimada",
    tom: (t) => (t.vagas === 0 ? "neutral" : razao(t) >= 3 ? "danger" : razao(t) >= 1.5 ? "warn" : "ok"),
    legenda: [
      { label: "Até 1,5 inscrição por vaga", tone: "ok" },
      { label: "1,5 a 3", tone: "warn" },
      { label: "3 ou mais", tone: "danger" },
      { label: "Sem vaga estimada", tone: "neutral" },
    ],
  },
  {
    key: "vencidas",
    label: "Convocações vencidas",
    hint: "prazo passou sem resposta da família — vaga em risco de ficar ociosa",
    valor: (t) => t.em_atraso,
    formato: (t) => `${num(t.em_atraso)} vencida(s) de ${num(t.convocadas)} convocação(ões)`,
    tom: (t) => (t.em_atraso === 0 ? "ok" : t.em_atraso >= 10 ? "danger" : "warn"),
    legenda: [
      { label: "Nenhuma vencida", tone: "ok" },
      { label: "1 a 9", tone: "warn" },
      { label: "10 ou mais", tone: "danger" },
    ],
  },
  {
    key: "espera",
    label: "Lista de espera",
    hint: "crianças sem vaga reservada, com posição na fila",
    valor: (t) => t.lista_espera,
    formato: (t) => `${num(t.lista_espera)} criança(s) na fila`,
    tom: (t) => (t.lista_espera === 0 ? "neutral" : "warn"),
    legenda: [
      { label: "Com fila", tone: "warn" },
      { label: "Sem fila", tone: "neutral" },
    ],
  },
  {
    key: "vagas",
    label: "Vagas e matrículas",
    hint: "vagas estimadas do ano; a cor mostra quanto já virou matrícula confirmada",
    valor: (t) => t.vagas,
    formato: (t) => `${num(t.vagas)} vaga(s) · ${num(t.confirmadas)} matrícula(s) confirmada(s)`,
    tom: (t) => (t.vagas === 0 ? "neutral" : t.confirmadas / Math.max(1, t.vagas) >= 0.5 ? "ok" : "info"),
    legenda: [
      { label: "Metade das vagas ou mais já confirmadas", tone: "ok" },
      { label: "Menos da metade", tone: "info" },
      { label: "Sem vaga estimada", tone: "neutral" },
    ],
  },
];

interface Props {
  nivel: "rede" | "cre";
  cres: MapaCre[];
  unidades: MapaUnidade[];
  metrica: Metrica;
  unidadeSelecionada?: string | null;
  onCre?: (cre: string) => void;
  onUnidade?: (codigo: string) => void;
}

const RIO: L.LatLngExpression = [-22.92, -43.4];

/** Mapa do território com drill-down: bolhas por CRE na rede, uma bolha por creche dentro da CRE.
   Área da bolha proporcional ao valor da métrica (raio ∝ √valor), cor pela faixa da métrica. */
export default function MapaTerritorio({ nivel, cres, unidades, metrica, unidadeSelecionada, onCre, onUnidade }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);
  const cbRef = useRef({ onCre, onUnidade });
  cbRef.current = { onCre, onUnidade };

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    // OpenStreetMap padrão: sem chave de API (o basemap claro da CARTO passou a exigir uma e carimba
    // "API KEY REQUIRED" sobre os ladrilhos). A opacidade deixa o mapa em segundo plano, atrás das bolhas.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      opacity: 0.55,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    map.setView(RIO, 10);
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
    const tamanho = metrica.tamanho ?? metrica.valor;
    const itens: (MapaCre | MapaUnidade)[] = nivel === "rede" ? cres : unidades;
    const max = Math.max(1e-9, ...itens.map((i) => tamanho(i)));

    if (nivel === "rede") {
      for (const c of cres) {
        if (c.lat == null || c.lon == null) continue;
        const v = tamanho(c);
        const raio = 10 + 24 * Math.sqrt(Math.max(0, v) / max);
        const bolha = L.circleMarker([c.lat, c.lon], {
          radius: raio,
          color: "#ffffff",
          weight: 2,
          fillColor: COR_TOM[metrica.tom(c)],
          fillOpacity: 0.75,
        }).bindTooltip(`<strong>${c.cre}ª CRE</strong><br>${metrica.formato(c)}<br>${num(c.unidades)} unidades`, {
          direction: "top",
        });
        bolha.on("click", () => cbRef.current.onCre?.(c.cre));
        bolha.addTo(camada);
        L.marker([c.lat, c.lon], {
          icon: L.divIcon({ className: "mapa-rotulo", html: `<span class="mapa-rotulo-cre">${c.cre}ª</span>`, iconSize: [34, 20], iconAnchor: [17, 10] }),
          interactive: false,
        }).addTo(camada);
        pontos.push([c.lat, c.lon]);
      }
    } else {
      for (const u of unidades) {
        if (u.lat == null || u.lon == null) continue;
        const v = tamanho(u);
        const raio = 5 + 15 * Math.sqrt(Math.max(0, v) / max);
        const escolhida = u.codigo === unidadeSelecionada;
        const bolha = L.circleMarker([u.lat, u.lon], {
          radius: raio,
          color: escolhida ? "#005e96" : "#ffffff",
          weight: escolhida ? 3 : 1.5,
          fillColor: COR_TOM[metrica.tom(u)],
          fillOpacity: 0.8,
        }).bindTooltip(`<strong>${u.nome ?? u.codigo}</strong><br>${metrica.formato(u)}`, { direction: "top" });
        bolha.on("click", () => cbRef.current.onUnidade?.(u.codigo));
        bolha.addTo(camada);
        pontos.push([u.lat, u.lon]);
      }
    }

    if (pontos.length >= 2) map.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: 14 });
    else if (pontos.length === 1) map.setView(pontos[0], 14);
    else map.setView(RIO, 10);
    setTimeout(() => map.invalidateSize(), 50);
  }, [nivel, cres, unidades, metrica, unidadeSelecionada]);

  const semCoordenada = nivel === "rede"
    ? cres.every((c) => c.lat == null)
    : unidades.length > 0 && unidades.every((u) => u.lat == null);

  return (
    <div className="mapa-wrap">
      <div ref={ref} className="mapa mapa-alto" role="img" aria-label={`Mapa ${nivel === "rede" ? "da rede por CRE" : "das creches da CRE"} — ${metrica.label}`} />
      {semCoordenada && (
        <p className="text-sm muted">
          Nenhuma unidade deste recorte tem coordenada na base da SME — a lista ao lado continua completa.
        </p>
      )}
      <p className="mapa-legenda">
        {metrica.legenda.map((l) => (
          <span key={l.label}>
            <i style={{ background: COR_TOM[l.tone] }} />
            {l.label}
          </span>
        ))}
        <span>
          Tamanho da bolha = {metrica.tamanhoLabel ?? metrica.label.toLowerCase()}; a cor é a faixa acima.{" "}
          {nivel === "rede" ? "Clique numa CRE para abrir as creches dela." : "Clique numa creche para ver os números dela."}
        </span>
      </p>
    </div>
  );
}
