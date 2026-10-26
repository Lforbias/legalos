/** Geocodificação pelo OpenStreetMap (Nominatim). Política de uso: 1 consulta por segundo e identificação própria no User-Agent. */
export type GeoInput = { street?: string | null; number?: string | null; district?: string | null; city?: string | null; state?: string | null; zip?: string | null };
export type GeoResult = { lat: number; lng: number; note: string };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function inBrazil(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -34 && lat <= 6 && lng >= -74 && lng <= -34;
}

function attempts(p: GeoInput): { label: string; params: Record<string, string> }[] {
  const out: { label: string; params: Record<string, string> }[] = [];
  const street = [p.number, p.street].filter(Boolean).join(" ").trim();
  const city = p.city || "São Paulo";
  const state = p.state || "SP";
  if (street) out.push({ label: "endereço completo", params: { street, city, state, ...(p.zip ? { postalcode: p.zip.replace(/^(\d{5})(\d{3})$/, "$1-$2") } : {}) } });
  if (p.street) out.push({ label: "rua", params: { street: p.street, city, state } });
  if (p.zip) out.push({ label: "CEP", params: { postalcode: p.zip.replace(/^(\d{5})(\d{3})$/, "$1-$2"), city, state } });
  return out;
}

export async function geocodeAddress(p: GeoInput, fetchImpl: typeof fetch = fetch): Promise<GeoResult | null> {
  const base = (process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
  const contact = process.env.NOMINATIM_EMAIL;
  for (const a of attempts(p)) {
    const qs = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "br", ...a.params, ...(contact ? { email: contact } : {}) });
    let res: Response;
    try {
      res = await fetchImpl(`${base}/search?${qs.toString()}`, { headers: { "user-agent": "LegalOS-Comercial/1.0 (prospeccao)", accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => [])) as { lat?: string; lon?: string }[];
    const r = rows[0];
    const lat = Number(r?.lat);
    const lng = Number(r?.lon);
    if (r && inBrazil(lat, lng)) return { lat, lng, note: `OpenStreetMap (${a.label})` };
    await sleep(1100);
  }
  return null;
}
