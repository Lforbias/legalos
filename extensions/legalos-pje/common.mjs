export const API_ORIGIN = "https://www.legalossync.tech";
export function courtOrigin(raw) {
  try { const u = new URL(raw); return u.protocol === "https:" && u.hostname.endsWith(".jus.br") && !u.port && !u.username && !u.password ? u.origin : null; } catch { return null; }
}
export function normalizedCnj(raw) {
  if (typeof raw !== "string" || !/^\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}$/.test(raw)) return null;
  const d = raw.replace(/\D/g, "");
  if (BigInt(d.slice(0, 7) + d.slice(9) + d.slice(7, 9)) % 97n !== 1n) return null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}
