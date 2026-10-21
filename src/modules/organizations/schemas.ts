import { z } from "zod";
import { isValidTimeZone } from "@/lib/validation/timezone";

const timezone = z.string().refine(isValidTimeZone, "Fuso horário inválido.");

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do escritório.").max(100),
  legalName: z.string().trim().max(160).optional().or(z.literal("")),
  timezone,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do escritório.").max(100),
  legalName: z.string().trim().max(160).optional().or(z.literal("")),
  document: z.string().trim().max(32).optional().or(z.literal("")),
  timezone,
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
