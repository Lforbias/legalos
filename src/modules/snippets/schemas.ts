import { z } from "zod";

export const snippetSchema = z.object({
  slug: z.string().trim().min(1, "Informe o código.").max(60, "Máximo de 60 caracteres.").regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use letras minúsculas, números e hífens (ex.: pedidos-finais)."),
  name: z.string().trim().min(3, "Informe um nome (mín. 3 caracteres).").max(120, "Máximo de 120 caracteres."),
  description: z.string().trim().max(300, "Máximo de 300 caracteres."),
  body: z.string().min(1, "Escreva o texto.").max(20000, "Máximo de 20.000 caracteres."),
  active: z.boolean(),
});
export type SnippetFormInput = z.infer<typeof snippetSchema>;
export const EMPTY_SNIPPET: SnippetFormInput = { slug: "", name: "", description: "", body: "", active: true };
