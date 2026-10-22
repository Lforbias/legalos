import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";

const uuidOrEmpty = z.union([z.string().uuid(), z.literal("")]);

export const boardNameSchema = z.string().trim().min(2, "Informe o nome (mín. 2 letras).").max(80);
export const columnNameSchema = z.string().trim().min(1, "Informe o nome da coluna.").max(40);

export const cardSchema = z.object({
  title: z.string().trim().min(3, "Informe um título (mín. 3 caracteres).").max(200),
  description: z.string().trim().max(4000).default(""),
  columnId: uuidOrEmpty.default(""),
  assigneeId: uuidOrEmpty.default(""),
  dueDate: z.string().max(10).refine((v) => v === "" || isYmd(v), "Data inválida.").default(""),
  caseId: uuidOrEmpty.default(""),
  clientId: uuidOrEmpty.default(""),
});
export type CardInput = z.input<typeof cardSchema>;

export const DEFAULT_COLUMNS = [
  { name: "A fazer", isDone: false },
  { name: "Em andamento", isDone: false },
  { name: "Concluído", isDone: true },
] as const;

export const MAX_COLUMNS = 12;
