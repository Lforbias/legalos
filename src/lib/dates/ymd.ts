/** Datas "de calendário" (sem hora) como string `YYYY-MM-DD`, com aritmética em UTC (sem efeitos de fuso/horário de verão). */
export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(v: string): boolean {
  if (!YMD_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function ymdToDate(v: string): Date {
  return new Date(`${v}T00:00:00Z`);
}

export function dateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(v: string, n: number): string {
  const d = ymdToDate(v);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToYmd(d);
}

/** Dia da semana: 0 = domingo … 6 = sábado. */
export function weekday(v: string): number {
  return ymdToDate(v).getUTCDay();
}

/** "Hoje" como YYYY-MM-DD no fuso informado (o do escritório). */
export function todayYmd(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function diffDays(a: string, b: string): number {
  return Math.round((ymdToDate(a).getTime() - ymdToDate(b).getTime()) / 86_400_000);
}

export function formatYmd(v: string): string {
  return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
}
