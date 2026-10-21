import { z } from "zod";

export const sendTextSchema = z.object({
  clientId: z.string().uuid(),
  caseId: z.string().uuid().nullish(),
  text: z.string().trim().min(2, "Escreva a mensagem.").max(1000, "Mensagem: no máximo 1000 caracteres."),
});
export type SendTextInput = z.infer<typeof sendTextSchema>;
