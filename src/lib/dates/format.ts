/** Datas são armazenadas em UTC e apresentadas no fuso do usuário/escritório. */
export function formatDateTime(date: Date | string, timeZone = "America/Sao_Paulo", locale = "pt-BR"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(date));
}

export function formatDate(date: Date | string, timeZone = "America/Sao_Paulo", locale = "pt-BR"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone }).format(new Date(date));
}

export function relativeTime(date: Date | string, now = new Date(), locale = "pt-BR"): string {
  const diffSec = Math.round((new Date(date).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}
