import { z } from "zod";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation/common";

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  /** Presente quando o cadastro parte de um convite: o convite é aceito logo após criar a conta. */
  inviteToken: z.string().max(200).optional(),
  /** Só exigido quando o cadastro é por código (REGISTRATION_MODE=code) e não há convite. */
  accessCode: z.string().max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(128),
  next: z.string().max(500).optional(),
  inviteToken: z.string().max(200).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: z.string().min(10).max(200), password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
