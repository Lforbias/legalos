import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254)
  .pipe(z.email("E-mail inválido."));

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter ao menos 10 caracteres.")
  .max(128, "A senha deve ter no máximo 128 caracteres.")
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Use letras e números na senha.");

export const nameSchema = z.string().trim().min(2, "Informe o nome.").max(120);

export const uuidSchema = z.uuid("Identificador inválido.");

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionState<T = undefined> = {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
  data?: T;
};

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
