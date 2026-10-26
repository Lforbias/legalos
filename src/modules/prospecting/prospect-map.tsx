"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

type Point = { cnpj: string; legalName: string; latitude: number | null; longitude: number | null; doNotContact: boolean; locationAccuracy: string | null };
export function ProspectMap({ points }: { points: Point[] }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<LeafletMap | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    void import("leaflet").then(L => {
      if (disposed || !container.current) return;
      const map = L.map(container.current, { scrollWheelZoom: false }).setView([-23.5505, -46.6333], 11);
      instance.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).on("tileerror", () => { if (!disposed) setUnavailable(true); }).addTo(map);
      for (const point of points) {
        if (point.latitude === null || point.longitude === null) continue;
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = point.legalName;
        const description = document.createElement("p");
        description.textContent = `${point.locationAccuracy === "POSTAL_CODE" ? "Localização aproximada por CEP" : "Endereço conferido"}${point.doNotContact ? " · Não contatar" : ""}`;
        const link = document.createElement("a");
        link.href = `/admin/comercial/prospeccao/${point.cnpj}`;
        link.textContent = "Abrir cadastro →";
        content.append(title, description, link);
        L.circleMarker([point.latitude, point.longitude], { radius: 7, weight: 2, color: "#ffffff", fillColor: point.doNotContact ? "#a1a1aa" : "#18181b", fillOpacity: .85 }).bindPopup(content).addTo(map);
      }
    }).catch(() => { if (!disposed) setUnavailable(true); });
    return () => { disposed = true; instance.current?.remove(); instance.current = null; };
  }, [points]);
  return <div className="relative isolate overflow-hidden rounded-2xl border border-border">
    <div ref={container} className="h-[440px] w-full bg-surface" aria-label="Mapa dos escritórios na cidade de São Paulo" />
    {!points.length && <div className="pointer-events-none absolute left-14 right-4 top-4 z-[500] max-w-sm rounded-xl border border-border bg-surface p-4 text-sm shadow-sm"><strong>São Paulo, capital</strong><p className="mt-1 text-xs text-muted">Os cadastros com coordenadas conferidas aparecerão aqui. Sem localização, continuam disponíveis na lista.</p></div>}
    {unavailable && <p role="status" className="border-t border-border bg-surface px-4 py-2 text-xs text-muted">O mapa não carregou completamente. Os cadastros continuam disponíveis na lista.</p>}
  </div>;
}
