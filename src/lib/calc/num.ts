/**
 * Aritmética decimal de ponto fixo (BigInt, 12 casas) para as calculadoras.
 * Dinheiro nunca passa por `number`. Valores monetários de entrada/saída são strings "1234.56".
 */
export const S = 10n ** 12n;
export type Fx = bigint;

/** "105.492562" | "-0.02" | "1518" → ponto fixo. Null se inválido (até 8 inteiros e 9 decimais). */
export function fx(v: string): Fx | null {
  const m = /^(-?)(\d{1,10})(?:\.(\d{1,12}))?$/.exec(v.trim());
  if (!m) return null;
  const n = BigInt(m[2]!) * S + BigInt((m[3] ?? "").padEnd(12, "0") || "0");
  return m[1] ? -n : n;
}

export const fxMul = (a: Fx, b: Fx): Fx => roundDiv(a * b, S);
export const fxDiv = (a: Fx, b: Fx): Fx => roundDiv(a * S, b);

function roundDiv(n: bigint, d: bigint): bigint {
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

/** Dinheiro "1234.56" → ponto fixo. */
export const money = (v: string): Fx => {
  const r = fx(v);
  if (r === null) throw new RangeError(`Valor inválido: ${v}`);
  return r;
};

/** Ponto fixo → centavos (arredonda meio para cima, em módulo). */
export function toCents(a: Fx): bigint {
  return roundDiv(a, S / 100n);
}

export function centsToStr(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** Ponto fixo → "1234.56" (arredondado a 2 casas). */
export const fxMoney = (a: Fx): string => centsToStr(toCents(a));

/** Ponto fixo → texto com `dec` casas ("1.234567"). */
export function fxStr(a: Fx, dec: number): string {
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const scale = 10n ** BigInt(12 - dec);
  const r = roundDiv(abs, scale);
  const p = 10n ** BigInt(dec);
  return `${neg ? "-" : ""}${r / p}${dec ? "." + (r % p).toString().padStart(dec, "0") : ""}`;
}

/** Fator mensal de uma taxa em % ("0.46" → 1,0046). */
export const rateFactor = (rate: Fx): Fx => S + rate / 100n;

export const monthKey = (ymd: string) => ymd.slice(0, 7);
export const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
export function monthFromIndex(i: number): string {
  return `${String(Math.floor(i / 12)).padStart(4, "0")}-${String((i % 12) + 1).padStart(2, "0")}`;
}
/** Meses de `from` até `to`, ambos INCLUSIVE ("YYYY-MM"). Vazio se to < from. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = monthIndex(from); i <= monthIndex(to) && out.length < 1200; i++) out.push(monthFromIndex(i));
  return out;
}

export type RateMap = Map<string, string>;

/** Produto dos fatores mensais de `months`. Devolve os meses sem taxa (não calcula nesse caso). */
export function accumulate(months: string[], rates: RateMap): { ok: true; factor: Fx } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  let f = S;
  for (const m of months) {
    const r = rates.get(m);
    const p = r === undefined ? null : fx(r);
    if (p === null) missing.push(m);
    else f = fxMul(f, rateFactor(p));
  }
  return missing.length ? { ok: false, missing } : { ok: true, factor: f };
}

export const brl = (v: string): string => {
  const neg = v.startsWith("-");
  const [int = "0", frac = "00"] = v.replace("-", "").split(".");
  return `${neg ? "-" : ""}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${frac.padEnd(2, "0").slice(0, 2)}`;
};
export const brNum = (v: string): string => v.replace(".", ",");
export const mm = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

export class CalcError extends Error {
  constructor(message: string, public readonly missing: string[] = []) {
    super(message);
  }
}

/** Resultado padronizado de qualquer calculadora (guardado como JSON e usado nas exportações). */
export type CalcSection = { title: string; columns: string[]; rows: string[][] };
export type CalcResult = {
  kind: string;
  title: string;
  /** Total geral em "1234.56". */
  total: string;
  summary: [string, string][];
  sections: CalcSection[];
  warnings: string[];
  /** Critérios e premissas aplicadas (texto), para o "memorial de cálculo". */
  criteria: string[];
};

export function memorial(r: CalcResult): string {
  const lines: string[] = [r.title.toUpperCase(), ""];
  if (r.criteria.length) lines.push("CRITÉRIOS:", ...r.criteria.map((c) => `- ${c}`), "");
  for (const s of r.sections) {
    lines.push(s.title.toUpperCase(), s.columns.join(" | "), ...s.rows.map((x) => x.join(" | ")), "");
  }
  lines.push("RESUMO:", ...r.summary.map(([k, v]) => `${k}: ${v}`));
  if (r.warnings.length) lines.push("", "AVISOS:", ...r.warnings.map((w) => `- ${w}`));
  lines.push("", "Ferramenta de apoio. Confira o resultado com o critério da decisão e, quando exigido, com o cálculo oficial do juízo.");
  return lines.join("\n");
}
