import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido.");
const time = z.string().refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Horário inválido (use HH:MM).");

export const EVENT_KINDS = ["HEARING", "MEETING", "DILIGENCE", "OTHER"] as const;
export const EVENT_KIND_LABEL: Record<(typeof EVENT_KINDS)[number], string> = { HEARING: "Audiência", MEETING: "Reunião", DILIGENCE: "Diligência", OTHER: "Outro" };

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Informe um título (mín. 3 caracteres).").max(200),
    kind: z.enum(EVENT_KINDS),
    date: z.string().refine(isYmd, "Informe a data."),
    allDay: z.boolean(),
    startTime: time,
    endTime: time,
    location: text(200),
    description: text(2000),
    caseId: uuidOrEmpty,
    clientId: uuidOrEmpty,
  })
  .superRefine((v, ctx) => {
    if (!v.allDay && v.startTime === "") ctx.addIssue({ code: "custom", path: ["startTime"], message: "Informe o horário de início ou marque “dia inteiro”." });
    if (!v.allDay && v.endTime && v.startTime && v.endTime < v.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "O término não pode ser anterior ao início." });
  });
export type EventInput = z.infer<typeof eventSchema>;

export const EMPTY_EVENT: EventInput = { title: "", kind: "MEETING", date: "", allDay: false, startTime: "09:00", endTime: "", location: "", description: "", caseId: "", clientId: "" };
