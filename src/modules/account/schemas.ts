import { z } from "zod";
import { nameSchema, passwordSchema } from "@/lib/validation/common";
import { isValidTimeZone } from "@/lib/validation/timezone";

export const profileSchema = z.object({
  name: nameSchema,
  locale: z.enum(["pt-BR", "en-US"]),
  timezone: z.string().refine(isValidTimeZone, "Fuso horário inválido."),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual.").max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
