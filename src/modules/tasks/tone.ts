import { diffDays, todayYmd } from "@/lib/dates/ymd";

export const PRIORITY_TONE = { LOW: "neutral", NORMAL: "info", HIGH: "warning", URGENT: "danger" } as const;

/** Situação de vencimento de uma tarefa aberta, relativa a "hoje" no fuso do escritório. */
export function dueState(dueYmd: string | null, open: boolean, tz: string): "overdue" | "today" | "soon" | "ok" | "none" {
  if (!dueYmd || !open) return "none";
  const d = diffDays(dueYmd, todayYmd(tz));
  return d < 0 ? "overdue" : d === 0 ? "today" : d <= 3 ? "soon" : "ok";
}
