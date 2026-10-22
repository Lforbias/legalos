import { addMonthsClamped, fromCents, toCents } from "./money";

/** Série de índice: INPC, IPCA ou SELIC (taxa mensal acumulada, em %). */
export const INDEX_SERIES = ["INPC", "IPCA", "SELIC"] as const;
export type IndexSeries = (typeof INDEX_SERIES)[number];
export const INDEX_LABEL: Record<IndexSeries, string> = { INPC: "INPC (IBGE)", IPCA: "IPCA (IBGE)", SELIC: "SELIC (BCB)" };

const SCALE = 10n ** 18n;
const RATE_SCALE = 10n ** 8n; // taxa em % com 6 casas: 0,460000 % = 460000 → fator 1 + 460000/1e8

/** "0.46" | "-0.02" | "1" → taxa em 1e-6 %. Null se inválida. */
export function parseRate(v: string): bigint | null {
  const m = /^(-?)(\d{1,3})(?:\.(\d{1,6}))?$/.exec(v.trim());
  if (!m) return null;
  const n = BigInt(m[2]!) * 1_000_000n + BigInt((m[3] ?? "").padEnd(6, "0") || "0");
  return m[1] ? -n : n;
}

export const monthKey = (ymd: string) => ymd.slice(0, 7);

/** Meses (YYYY-MM) do mês-base INCLUSIVE até o mês do alvo EXCLUSIVE. Alvo ≤ base → lista vazia. */
export function monthsBetween(baseYmd: string, targetYmd: string): string[] {
  const out: string[] = [];
  let cur = `${monthKey(baseYmd)}-01`;
  const end = `${monthKey(targetYmd)}-01`;
  while (cur < end && out.length < 600) {
    out.push(monthKey(cur));
    cur = addMonthsClamped(cur, 1);
  }
  return out;
}

export type CorrectionResult =
  | { ok: true; factor: string; corrected: string; months: number }
  | { ok: false; missing: string[]; months: number };

/**
 * Correção monetária por produto dos índices mensais: de cada mês, do mês-base até o mês anterior ao da atualização.
 * Se faltar índice de algum mês, NÃO calcula (devolve os meses que faltam). Estimativa de apoio — não substitui o cálculo oficial.
 */
export function correct(value: string, baseYmd: string, targetYmd: string, rates: Map<string, string>): CorrectionResult {
  const cents = toCents(value);
  if (cents === null) throw new Error("Valor inválido.");
  const months = monthsBetween(baseYmd, targetYmd);
  const missing = months.filter((m) => parseRate(rates.get(m) ?? "x") === null);
  if (missing.length) return { ok: false, missing, months: months.length };
  let f = SCALE;
  for (const m of months) f = (f * (RATE_SCALE + parseRate(rates.get(m)!)!)) / RATE_SCALE;
  const corrected = (cents * f + SCALE / 2n) / SCALE;
  const factor = `${f / SCALE}.${((f % SCALE) / 10n ** 10n).toString().padStart(8, "0")}`;
  return { ok: true, factor, corrected: fromCents(corrected), months: months.length };
}
