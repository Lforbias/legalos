import { z } from "zod";

export const STAGES = {
  NEW: "Novo", QUALIFIED: "Qualificado", CONTACTED: "Contato realizado", DEMO: "Demonstração",
  PROPOSAL: "Proposta", WON: "Contratado", LOST: "Sem interesse",
} as const;
export const stageSchema = z.enum(["NEW", "QUALIFIED", "CONTACTED", "DEMO", "PROPOSAL", "WON", "LOST"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}, "Data inválida");
export const prospectEditSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/), version: z.number().int().nonnegative(), stage: stageSchema,
  doNotContact: z.boolean(), contactVerified: z.boolean(), notes: z.string().max(5000),
  nextContactOn: date.nullable(),
  latitude: z.number().min(-24.1).max(-23.3).nullable(),
  longitude: z.number().min(-46.9).max(-46.3).nullable(),
  locationAccuracy: z.enum(["ADDRESS", "POSTAL_CODE"]).nullable(),
}).refine(v => (v.latitude === null) === (v.longitude === null), "Informe latitude e longitude juntas")
  .refine(v => v.latitude === null || v.locationAccuracy !== null, "Informe a precisão da localização")
  .refine(v => !v.doNotContact || v.nextContactOn === null, "Remova o retorno agendado ao marcar não contatar");
export type ProspectEdit = z.infer<typeof prospectEditSchema>;
export const importProspectSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/), legalName: z.string().min(1).max(300),
  tradeName: z.string().max(300), legalNature: z.string().max(200), companySize: z.string().max(2),
  openedOn: z.string().max(8), address: z.string().max(600), neighborhood: z.string().max(100),
  postalCode: z.string().max(8), phone: z.string().max(30), email: z.string().max(200),
  cnae: z.literal("6911701"), sourceMonth: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
  city: z.literal("SAO PAULO"), state: z.literal("SP"), situation: z.literal("02"),
});
