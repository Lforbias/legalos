import { z } from "zod";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);

export const REGISTRY_KINDS = ["PERSON", "COMPANY", "ORGAN", "LAWYER"] as const;
export const REGISTRY_KIND_LABEL: Record<(typeof REGISTRY_KINDS)[number], string> = {
  PERSON: "Pessoa física",
  COMPANY: "Pessoa jurídica",
  ORGAN: "Órgão público",
  LAWYER: "Advogado(a)",
};

export const registrySchema = z.object({
  kind: z.enum(REGISTRY_KINDS),
  name: z.string().trim().min(2, "Informe o nome.").max(160),
  document: text(24),
  profession: text(80),
  issuingOrgan: text(40),
  email: text(160).refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
  phone: text(30),
  notes: text(2000),
});
export type RegistryInput = z.infer<typeof registrySchema>;
