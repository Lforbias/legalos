import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido.");

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELED"] as const;
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const TASK_STATUS_LABEL: Record<(typeof TASK_STATUSES)[number], string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando",
  DONE: "Concluída",
  CANCELED: "Cancelada",
};
export const TASK_PRIORITY_LABEL: Record<(typeof TASK_PRIORITIES)[number], string> = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" };

export const taskSchema = z.object({
  title: z.string().trim().min(3, "Informe um título (mín. 3 caracteres).").max(200),
  description: text(4000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: text(10).refine((v) => v === "" || isYmd(v), "Data inválida."),
  assigneeId: uuidOrEmpty,
  caseId: uuidOrEmpty,
  clientId: uuidOrEmpty,
});
export type TaskInput = z.infer<typeof taskSchema>;

export const commentSchema = z.object({ body: z.string().trim().min(1, "Escreva o comentário.").max(2000) });
export type CommentInput = z.infer<typeof commentSchema>;

export function toTaskData(i: TaskInput) {
  return {
    title: i.title.trim(),
    description: i.description.trim() || null,
    status: i.status,
    priority: i.priority,
    dueDate: i.dueDate ? new Date(`${i.dueDate}T00:00:00Z`) : null,
    assigneeId: i.assigneeId || null,
    caseId: i.caseId || null,
    clientId: i.clientId || null,
  };
}

export const EMPTY_TASK: TaskInput = { title: "", description: "", status: "TODO", priority: "NORMAL", dueDate: "", assigneeId: "", caseId: "", clientId: "" };
