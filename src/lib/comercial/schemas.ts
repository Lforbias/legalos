import { z } from "zod";
import { STAGE_KEYS } from "./stages";

const opt = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optInt = (min: number, max: number) =>
  z.union([z.number(), z.string(), z.null(), z.undefined()]).default(null).transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `Use um número entre ${min} e ${max}.` });
      return z.NEVER;
    }
    return Math.round(n);
  });

/** Reais digitados ("1.490,00" ou "1490.5") → centavos. */
export function reaisToCents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const raw = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!raw) return null;
  const norm = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 && n < 100_000_000 ? Math.round(n * 100) : null;
}
export const centsField = z.union([z.string(), z.number(), z.null(), z.undefined()]).default(null).transform((v, ctx) => {
  if (v === null || v === undefined || v === "") return null;
  const c = reaisToCents(v);
  if (c === null) {
    ctx.addIssue({ code: "custom", message: "Valor inválido." });
    return z.NEVER;
  }
  return c;
});

const dateOpt = z.union([z.string(), z.null(), z.undefined()]).default(null).transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: "Data inválida." });
    return z.NEVER;
  }
  return d;
});

export const prospectSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do escritório.").max(160),
  cnpj: opt(20),
  legalName: opt(200),
  phone: opt(40),
  phone2: opt(40),
  whatsapp: opt(40),
  email: opt(200).refine((v) => !v || z.email().safeParse(v).success, "E-mail inválido."),
  website: opt(200),
  street: opt(200),
  number: opt(20),
  complement: opt(100),
  district: opt(100),
  city: z.string().trim().max(100).default("São Paulo"),
  state: z.string().trim().max(2).default("SP"),
  zip: opt(10),
  lawyersEstimate: optInt(1, 100000),
  areas: z.string().trim().max(300).optional().nullable().transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12) : [])),
  tags: z.string().trim().max(300).optional().nullable().transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12) : [])),
  rankingPosition: optInt(1, 100000),
  rankingSource: opt(120),
  ownerId: z.union([z.uuid(), z.literal(""), z.null(), z.undefined()]).default(null).transform((v) => (v ? v : null)),
  planKey: opt(60),
  expectedUsers: optInt(1, 5000),
  expectedMonthlyCents: centsField,
  probabilityPct: optInt(0, 100),
  expectedCloseAt: dateOpt,
  nextActionAt: dateOpt,
  nextActionNote: opt(300),
  notes: opt(4000),
  doNotContact: z.union([z.boolean(), z.string(), z.null(), z.undefined()]).default(null).transform((v) => v === true || v === "on" || v === "true"),
  contactVerified: z.union([z.boolean(), z.string(), z.null(), z.undefined()]).default(null).transform((v) => v === true || v === "on" || v === "true"),
});
export type ProspectInput = z.output<typeof prospectSchema>;

export const stageSchema = z.object({ stage: z.enum(STAGE_KEYS), lostReason: opt(300), wonMonthlyCents: centsField.optional() });

export const activitySchema = z.object({
  kind: z.enum(["LIGACAO", "WHATSAPP", "EMAIL", "REUNIAO", "DEMONSTRACAO", "NOTA"]),
  summary: z.string().trim().min(2, "Conte rapidamente o que aconteceu.").max(2000),
  outcome: opt(300),
  nextActionAt: dateOpt,
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  role: opt(100),
  phone: opt(40),
  email: opt(200).refine((v) => !v || z.email().safeParse(v).success, "E-mail inválido."),
  isDecisionMaker: z.union([z.boolean(), z.string(), z.null(), z.undefined()]).default(null).transform((v) => v === true || v === "on" || v === "true"),
  notes: opt(500),
});

export const proposalSchema = z.object({
  planKey: z.string().trim().min(1, "Escolha o plano.").max(60),
  users: optInt(1, 5000).refine((v) => v !== null, "Informe os usuários.").transform((v) => v as number),
  addonKeys: z.array(z.string().max(60)).max(20).default([]),
  discountPct: optInt(0, 100).transform((v) => v ?? 0),
  setupCents: centsField.transform((v) => v ?? 0),
  validUntil: dateOpt,
  notes: opt(1000),
});

export const addonSchema = z.object({
  key: z.string().trim().min(2).max(40).regex(/^[a-z0-9_-]+$/, "Use letras minúsculas, números, - ou _."),
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  description: opt(300),
  priceCents: centsField,
  perUser: z.union([z.boolean(), z.string(), z.null(), z.undefined()]).default(null).transform((v) => v === true || v === "on" || v === "true"),
  active: z.union([z.boolean(), z.string(), z.null(), z.undefined()]).default(null).transform((v) => v === true || v === "on" || v === "true"),
});
