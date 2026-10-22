/** Lista de IPs permitidos: IPv4/IPv6 exato ou faixa IPv4 em CIDR (ex.: 200.10.0.0/24). Sem dependências. */

const v4 = (s: string): number | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((n) => n > 255)) return null;
  return ((p[0]! << 24) | (p[1]! << 16) | (p[2]! << 8) | p[3]!) >>> 0;
};

const stripMapped = (ip: string) => ip.trim().toLowerCase().replace(/^::ffff:/, "");

/** Devolve a entrada normalizada ou null se inválida. */
export function normalizeIpEntry(raw: string): string | null {
  const s = stripMapped(raw);
  if (!s) return null;
  const [addr, bits] = s.split("/") as [string, string | undefined];
  if (v4(addr) !== null) {
    if (bits === undefined) return addr;
    const n = Number(bits);
    return /^\d{1,2}$/.test(bits) && n >= 8 && n <= 32 ? `${addr}/${n}` : null;
  }
  // IPv6: só endereço exato, validação simples
  if (bits === undefined && /^[0-9a-f:]+$/.test(addr) && addr.includes(":") && addr.length <= 39 && addr.split(":").length >= 3) return addr;
  return null;
}

export function ipAllowed(ip: string | null | undefined, list: string[]): boolean {
  if (!ip) return false;
  const cur = stripMapped(ip);
  const curN = v4(cur);
  for (const entry of list) {
    const [addr, bits] = entry.split("/") as [string, string | undefined];
    if (bits === undefined) { if (addr === cur) return true; continue; }
    const base = v4(addr);
    if (base === null || curN === null) continue;
    const n = Number(bits);
    const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
    if (((curN & mask) >>> 0) === ((base & mask) >>> 0)) return true;
  }
  return false;
}
