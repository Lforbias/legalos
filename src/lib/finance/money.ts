/** Aritmética em centavos (BigInt). Nunca usa ponto flutuante para dinheiro. */

/** "1234.56" | "1234.5" | "1234" → 123456n. Retorna null se não for um decimal com até 2 casas. */
export function toCents(decimal: string): bigint | null {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(decimal.trim());
  if (!m) return null;
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

export function fromCents(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const int = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${int}.${frac}`;
}

/**
 * Divide `total` em `n` parcelas: parcelas iguais; o resto (centavos) vai para as primeiras, de 1 em 1 centavo.
 * A soma das parcelas é sempre exatamente o total.
 */
export function splitInstallments(total: bigint, n: number): bigint[] {
  if (n < 1 || !Number.isInteger(n)) throw new Error("Número de parcelas inválido.");
  const count = BigInt(n);
  const base = total / count;
  const extra = Number(total % count);
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1n : 0n));
}

/** Soma `months` meses a uma data YYYY-MM-DD mantendo o dia, ou o último dia do mês quando ele não existe (31/01 + 1 mês = 28/02). */
export function addMonthsClamped(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
