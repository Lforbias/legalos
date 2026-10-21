import { z } from "zod";

export const LABEL_COLORS = ["gray", "blue", "green", "amber", "red", "purple"] as const;
export const LABEL_COLOR_LABEL: Record<(typeof LABEL_COLORS)[number], string> = { gray: "Cinza", blue: "Azul", green: "Verde", amber: "Amarelo", red: "Vermelho", purple: "Roxo" };

export const taskTypeSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome (mín. 2 caracteres).").max(60, "Máximo de 60 caracteres."),
  points: z.number("Informe os pontos.").int("Use um número inteiro.").min(0, "Mínimo 0.").max(100, "Máximo 100."),
});
export type TaskTypeInput = z.infer<typeof taskTypeSchema>;

export const taskLabelSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome (mín. 2 caracteres).").max(40, "Máximo de 40 caracteres."),
  color: z.enum(LABEL_COLORS),
});
export type TaskLabelInput = z.infer<typeof taskLabelSchema>;

export const classificationSchema = z.object({
  typeId: z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Tipo inválido."),
  labelIds: z.array(z.uuid()).max(20, "Máximo de 20 etiquetas."),
});
export type ClassificationInput = z.infer<typeof classificationSchema>;

export const TASK_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
