import { z } from "zod";
import { emailSchema, uuidSchema } from "@/lib/validation/common";

export const inviteSchema = z.object({ email: emailSchema, roleId: uuidSchema });
export type InviteInput = z.infer<typeof inviteSchema>;

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do perfil.").max(60),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  permissions: z.array(z.string()).max(100),
});
export type RoleInput = z.infer<typeof roleSchema>;
