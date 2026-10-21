import { z } from "zod";

export const ANNOUNCEMENT_KINDS = { INFO: "Novidade", MAINTENANCE: "Manutenção", ALERT: "Alerta" } as const;

export const announcementSchema = z
  .object({
    kind: z.enum(["INFO", "MAINTENANCE", "ALERT"]),
    title: z.string().trim().min(3, "Escreva um título de pelo menos 3 letras.").max(80, "Título: no máximo 80 caracteres."),
    body: z.string().trim().min(3, "Escreva a mensagem.").max(400, "Mensagem: no máximo 400 caracteres."),
    link: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || (v.startsWith("/") && !v.startsWith("//")), "O link deve ser um caminho do próprio sistema, como /prazos."),
    audience: z.enum(["ALL", "ORG", "USER"]),
    organizationId: z.string().uuid().nullish(),
    userEmail: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(200).nullish(),
    viaInApp: z.boolean(),
    viaPush: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.viaInApp && !v.viaPush) ctx.addIssue({ code: "custom", path: ["viaInApp"], message: "Escolha pelo menos um canal: aviso no sistema ou no celular." });
    if (v.audience === "ORG" && !v.organizationId) ctx.addIssue({ code: "custom", path: ["organizationId"], message: "Escolha o escritório." });
    if (v.audience === "USER" && !v.userEmail) ctx.addIssue({ code: "custom", path: ["userEmail"], message: "Informe o e-mail da pessoa." });
  });
export type AnnouncementInput = z.infer<typeof announcementSchema>;
