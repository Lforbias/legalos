import { ValidationError } from "@/lib/permissions/check";
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
      res = await fetchImpl(`${base}/search?${qs.toString()}`, { headers: { "user-agent": "LegalOS-Comercial/1.0 (+https://www.legalossync.tech/produto/contato)", accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new ValidationError("O serviço de mapas não respondeu. A localização continua pendente; tente novamente.");
    }
    if (!res.ok) throw new ValidationError(res.status === 429 ? "O serviço de mapas está limitando consultas. Aguarde antes de tentar novamente." : "O serviço de mapas está indisponível. Tente novamente mais tarde.");
    const rows = (await res.json().catch(() => { throw new ValidationError("Resposta inválida do serviço de mapas. Tente novamente."); })) as { lat?: string; lon?: string }[];
    if (!Array.isArray(rows)) throw new ValidationError("Resposta inválida do serviço de mapas.");
    const r = rows[0];
    const lat = Number(r?.lat);
    const lng = Number(r?.lon);
    if (r && inBrazil(lat, lng) && (!(p.city?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "sao paulo") || (lat >= -24.1 && lat <= -23.3 && lng >= -46.9 && lng <= -46.3))) return { lat, lng, note: `OpenStreetMap (${a.label}; localização estimada, não conferida)` };
    await sleep(1100);
  }
  return null;
}
