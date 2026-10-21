import { diffDays, todayYmd } from "@/lib/dates/ymd";

export function deadlineDue(dueYmd: string, status: string, tz: string): { state: "overdue" | "today" | "soon" | "ok" | "closed"; days: number } {
  if (status !== "DRAFT" && status !== "VALIDATED") return { state: "closed", days: 0 };
  const d = diffDays(dueYmd, todayYmd(tz));
  return { state: d < 0 ? "overdue" : d === 0 ? "today" : d <= 3 ? "soon" : "ok", days: d };
}

export const DUE_BADGE = { overdue: "danger", today: "warning", soon: "warning", ok: "neutral", closed: "neutral" } as const;
export const STATUS_TONE = { DRAFT: "warning", VALIDATED: "info", FULFILLED: "success", CANCELED: "neutral" } as const;

export function dueText(state: string, days: number): string {
  if (state === "overdue") return `Vencido há ${Math.abs(days)} dia(s)`;
  if (state === "today") return "Vence hoje";
  if (state === "soon") return `Vence em ${days} dia(s)`;
  return "";
}
