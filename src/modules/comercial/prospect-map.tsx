"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LMap } from "leaflet";
import * as React from "react";
import { brl } from "@/lib/comercial/format";
import { STAGE_INFO, STAGE_KEYS, type StageKey } from "@/lib/comercial/stages";

export type MapPointDto = { id: string; name: string; lat: number; lng: number; stage: StageKey; ranking: number | null; monthlyCents: number | null; district: string | null };

/** Mapa do OpenStreetMap com um ponto por escritório, colorido pela etapa do funil. */
export function ProspectMap({ points }: { points: MapPointDto[] }) {
  const el = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LMap | null>(null);
  const layersRef = React.useRef<Record<string, import("leaflet").LayerGroup>>({});
  const [mapError, setMapError] = React.useState(false);
  const hiddenRef = React.useRef<Set<StageKey>>(new Set());
  const [hidden, setHidden] = React.useState<Set<StageKey>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const map = L.map(el.current, { zoomControl: true }).setView([-23.5505, -46.6333], 11);
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">OpenStreetMap</a>' }).on("tileerror", () => { if (!cancelled) setMapError(true); }).addTo(map);
      const groups: Record<string, import("leaflet").LayerGroup> = {};
      for (const k of STAGE_KEYS) groups[k] = L.layerGroup();
      for (const k of STAGE_KEYS) if (!hiddenRef.current.has(k)) groups[k]!.addTo(map);
      layersRef.current = groups;
      const bounds: [number, number][] = [];
      for (const p of points) {
        const top = p.ranking != null;
        const m = L.circleMarker([p.lat, p.lng], { radius: top ? 9 : 6, color: "#ffffff", weight: 2, fillColor: STAGE_INFO[p.stage].color, fillOpacity: 0.95 });
        const box = document.createElement("div");
        const t = document.createElement("strong");
        t.textContent = `${p.ranking ? `#${p.ranking} ` : ""}${p.name}`;
        const s = document.createElement("div");
        s.textContent = `${STAGE_INFO[p.stage].label}${p.district ? ` · ${p.district}` : ""}${p.monthlyCents ? ` · ${brl(p.monthlyCents)}/mês` : ""}`;
        const a = document.createElement("a");
        a.href = `/comercial/escritorios/${p.id}`;
        a.textContent = "Abrir ficha";
        box.append(t, s, a);
        m.bindPopup(box);
        m.addTo(groups[p.stage]!);
        bounds.push([p.lat, p.lng]);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      else if (bounds.length === 1) map.setView(bounds[0]!, 15);
    })().catch(() => { if (!cancelled) setMapError(true); });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [points]);

  React.useEffect(() => {
    hiddenRef.current = hidden;
    const map = mapRef.current;
    for (const k of STAGE_KEYS) {
      const g = layersRef.current[k];
      if (!g || !map) continue;
      if (hidden.has(k)) map.removeLayer(g);
      else if (!map.hasLayer(g)) g.addTo(map);
    }
  }, [hidden]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of points) c[p.stage] = (c[p.stage] ?? 0) + 1;
    return c;
  }, [points]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs" role="group" aria-label="Etapas visíveis no mapa">
        {STAGE_KEYS.map((k) => (
          <label key={k} className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={!hidden.has(k)} onChange={() => setHidden((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STAGE_INFO[k].color }} />
            {STAGE_INFO[k].label} ({counts[k] ?? 0})
          </label>
        ))}
        <span className="text-muted">Pontos maiores = escritórios da lista dos 100.</span>
      </div>
      {mapError ? <p role="status" className="text-sm text-muted">O mapa não carregou completamente. As fichas continuam disponíveis em Escritórios.</p> : null}
      <div ref={el} className="h-[560px] w-full overflow-hidden rounded-lg border border-border" role="application" aria-label="Mapa dos escritórios" />
    </div>
  );
}
