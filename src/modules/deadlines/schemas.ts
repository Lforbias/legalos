import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido.");

export const DEADLINE_STATUSES = ["DRAFT", "VALIDATED", "FULFILLED", "CANCELED"] as const;
export const DEADLINE_STATUS_LABEL: Record<(typeof DEADLINE_STATUSES)[number], string> = {
  DRAFT: "Aguardando validação",
  VALIDATED: "Validado",
  FULFILLED: "Cumprido",
  CANCELED: "Cancelado",
};
export const COUNT_TYPES = ["BUSINESS", "CALENDAR"] as const;
export const COUNT_TYPE_LABEL = { BUSINESS: "Dias úteis", CALENDAR: "Dias corridos" } as const;

export const DEADLINE_KINDS = ["Contestação", "Réplica", "Recurso", "Contrarrazões", "Manifestação", "Embargos", "Cumprimento de sentença", "Juntada de documentos", "Audiência", "Outro"] as const;

export const deadlineSchema = z
  .object({
    caseId: z.uuid("Selecione o processo."),
    title: z.string().trim().min(3, "Informe um título (mín. 3 caracteres).").max(200),
    kind: text(80),
    startDate: text(10).refine((v) => v === "" || isYmd(v), "Data inválida."),
    days: text(4).refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 3650), "Informe de 1 a 3650 dias."),
    countType: z.enum(["", ...COUNT_TYPES]),
    dueDate: z.string().trim().refine(isYmd, "Informe a data fatal do prazo."),
    internalDueDate: text(10).refine((v) => v === "" || isYmd(v), "Data inválida."),
    responsibleId: uuidOrEmpty,
    notes: text(2000),
    calculationNote: text(2000),
  })
  .superRefine((v, ctx) => {
    if (v.internalDueDate && isYmd(v.internalDueDate) && isYmd(v.dueDate) && v.internalDueDate > v.dueDate) {
      ctx.addIssue({ code: "custom", path: ["internalDueDate"], message: "O prazo interno não pode ser posterior à data fatal." });
    }
    if (v.days !== "" && (v.startDate === "" || v.countType === "")) {
      ctx.addIssue({ code: "custom", path: ["days"], message: "Para registrar a contagem, informe a data de início e o tipo de contagem." });
    }
  });
export type DeadlineInput = z.infer<typeof deadlineSchema>;

export const calcSchema = z.object({
  startDate: z.string().refine(isYmd, "Informe a data da ciência/publicação."),
  days: z.string().regex(/^\d+$/, "Informe a quantidade de dias.").refine((v) => Number(v) >= 1 && Number(v) <= 3650, "Informe de 1 a 3650 dias."),
  countType: z.enum(COUNT_TYPES),
});
export type CalcInput = z.infer<typeof calcSchema>;

export function toDeadlineData(i: DeadlineInput) {
  const date = (v: string) => (v ? new Date(`${v}T00:00:00Z`) : null);
  return {
    caseId: i.caseId,
    title: i.title.trim(),
    kind: i.kind.trim() || null,
    startDate: date(i.startDate),
    days: i.days ? Number(i.days) : null,
    countType: i.countType || null,
    dueDate: new Date(`${i.dueDate}T00:00:00Z`),
    internalDueDate: date(i.internalDueDate),
    responsibleId: i.responsibleId || null,
    notes: i.notes.trim() || null,
    calculationNote: i.calculationNote.trim() || null,
  };
}

export const EMPTY_DEADLINE: DeadlineInput = {
  caseId: "", title: "", kind: "", startDate: "", days: "", countType: "", dueDate: "", internalDueDate: "", responsibleId: "", notes: "", calculationNote: "",
};
