import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";

/** Aceita "1:30", "1h30", "1,5" (horas decimais) ou "90m"/"90min" → minutos. Retorna null se inválido. */
export function parseDuration(raw: string): number | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, "");
  let minutes: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{1,2})[:h](\d{1,2})(?:min|m)?$/))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = v.match(/^(\d{1,4})(?:m|min)$/))) minutes = Number(m[1]);
  else if ((m = v.match(/^(\d{1,2})(?:[.,](\d{1,2}))?h?$/))) minutes = Math.round(Number(`${m[1]}.${m[2] ?? "0"}`) * 60);
  if (minutes === null || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return null;
  return minutes;
}

export function formatMinutes(min: number): string {
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

export const timeEntrySchema = z.object({
  date: z.string().refine(isYmd, "Informe a data."),
  duration: z.string().trim().refine((v) => parseDuration(v) !== null, "Duração inválida. Use 1:30, 1,5 ou 90min (até 24h)."),
  description: z.string().trim().min(3, "Descreva a atividade (mín. 3 caracteres).").max(500),
  caseId: z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido."),
});
export type TimeEntryInput = z.infer<typeof timeEntrySchema>;
