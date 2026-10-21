import { utcToZoned } from "@/lib/dates/zoned";

/** Está FORA do expediente? `days`: 0 = domingo … 6 = sábado. Horários "HH:MM" no fuso do escritório. */
export function isOutsideHours(now: Date, timeZone: string, from: string, until: string, days: number[]): boolean {
  const { ymd, hhmm } = utcToZoned(now, timeZone);
  const weekday = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  if (!days.includes(weekday)) return true;
  if (from <= until) return hhmm < from || hhmm >= until;
  return hhmm < from && hhmm >= until; // expediente que atravessa a meia-noite
}
