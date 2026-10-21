import { z } from "zod";

export const slaSchema = z.object({
  enabled: z.boolean(),
  minutes: z.number().int("Informe minutos inteiros.").min(1, "Mínimo 1 minuto.").max(1440, "Máximo 1440 minutos (24 horas)."),
  notifyAssignee: z.boolean(),
  notifyEmail: z.boolean(),
  escalateUserId: z.string().uuid().nullable(),
});
export type SlaInput = z.infer<typeof slaSchema>;
