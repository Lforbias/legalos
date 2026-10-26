import { addDays } from "@/lib/dates/ymd";
import { utcToZoned, zonedToUtc } from "@/lib/dates/zoned";

export function noticeActivityWindow(days: number, timezone: string, now: Date) {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new RangeError("Período inválido.");
  const today = utcToZoned(now, timezone).ymd;
  const first = addDays(today, -(days - 1));
  return { first, since: zonedToUtc(first, "00:00", timezone), until: now };
}

/** IMPORTED não prova captura: inclui migração de histórico e registros via API. */
export function summarizeNoticeActivity(rows: { createdAt: Date; source: string; externalKey: string | null }[], days: number, timezone: string, now: Date) {
  const { first, since, until } = noticeActivityWindow(days, timezone, now);
  const perDay = new Map(Array.from({ length: days }, (_, i) => [addDays(first, i), 0]));
  const bySource = { imported: 0, captured: 0, otherImports: 0, manual: 0 };
  for (const row of rows) {
    if (row.createdAt < since || row.createdAt > until) continue;
    const day = utcToZoned(row.createdAt, timezone).ymd;
    if (!perDay.has(day)) continue;
    perDay.set(day, perDay.get(day)! + 1);
    if (row.source === "IMPORTED") {
      bySource.imported++;
      if (/^(djen|mni):/.test(row.externalKey ?? "")) bySource.captured++;
      else bySource.otherImports++;
    } else bySource.manual++;
  }
  const byDay = [...perDay].map(([day, count]) => ({ day, count }));
  return { bySource, byDay, total: byDay.reduce((sum, d) => sum + d.count, 0) };
}
