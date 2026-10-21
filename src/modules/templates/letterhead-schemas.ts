import { z } from "zod";

export const letterheadSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80, "Máximo de 80 caracteres."),
  headerText: z.string().max(600, "Máximo de 600 caracteres."),
  footerText: z.string().max(600, "Máximo de 600 caracteres."),
  /** undefined = manter; null = remover; texto = novo logo (base64). */
  logoBase64: z.string().max(450_000).nullable().optional(),
  showPageNumbers: z.boolean(),
  isDefault: z.boolean(),
  active: z.boolean(),
});
export type LetterheadFormInput = z.infer<typeof letterheadSchema>;
