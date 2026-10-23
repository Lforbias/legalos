import { createHash } from "node:crypto";
/** SCMPP/TJPR: MD5(código privado + yyyyMMdd), conforme manual do tribunal. Não é hash de armazenamento. */
export function tjprDailyPassword(code: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return createHash("md5").update(code + part("year") + part("month") + part("day"), "utf8").digest("hex");
}
