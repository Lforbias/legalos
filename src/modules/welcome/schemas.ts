import { z } from "zod";
import { isValidTimeZone } from "@/lib/validation/timezone";

export const BRAZIL_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

export const welcomeProfileSchema = z.object({
  professionalType: z.enum(["SOLO", "LAW_FIRM", "IN_HOUSE"]).optional(),
  areas: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  teamSize: z.enum(["SOLO", "2_5", "6_15", "16_PLUS"]).optional(),
  clientVolume: z.enum(["UNDER_100", "100_500", "501_2000", "OVER_2000"]).optional(),
  processVolume: z.enum(["UNDER_100", "100_500", "501_2000", "OVER_2000"]).optional(),
  previousTool: z.string().trim().max(100).default(""),
  mainPains: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  firstSteps: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  city: z.string().trim().max(100).default(""),
  state: z.string().trim().max(2).default(""),
  oabNumber: z.string().trim().max(12).regex(/^\d*$/, "Informe apenas números na inscrição OAB.").default(""),
  oabUf: z.union([z.enum(BRAZIL_UFS), z.literal("")]).default(""),
}).superRefine((profile, ctx) => {
  if (profile.oabNumber && profile.oabNumber.length < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["oabNumber"], message: "A inscrição OAB precisa ter pelo menos 3 números." });
  if (profile.oabNumber && !profile.oabUf) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["oabUf"], message: "Informe a UF da OAB." });
  if (!profile.oabNumber && profile.oabUf) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["oabNumber"], message: "Informe também o número da OAB." });
});

export const welcomeOfficeDraftSchema = z.object({
  name: z.string().trim().max(100).default(""),
  legalName: z.string().trim().max(160).default(""),
  document: z.string().trim().max(32).default(""),
  timezone: z.string().refine(isValidTimeZone, "Fuso horário inválido.").default("America/Sao_Paulo"),
});

export const welcomeDraftSchema = z.object({
  currentStep: z.number().int().min(1).max(3),
  data: z.object({
    profile: welcomeProfileSchema,
    office: welcomeOfficeDraftSchema,
    activationPath: z.enum(["TRIAL", "GIFT", "SUBSCRIPTION"]).optional(),
    planKey: z.string().trim().max(40).optional(),
  }),
});

export const welcomeOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do escritório.").max(100),
  legalName: z.string().trim().max(160).default(""),
  document: z.string().trim().max(32).default(""),
  timezone: z.string().refine(isValidTimeZone, "Fuso horário inválido."),
  data: welcomeProfileSchema,
  activationPath: z.enum(["TRIAL", "GIFT", "SUBSCRIPTION"]).default("TRIAL"),
  planKey: z.string().trim().max(40).optional(),
});

export type WelcomeProfile = z.infer<typeof welcomeProfileSchema>;
export type WelcomeOfficeDraft = z.infer<typeof welcomeOfficeDraftSchema>;
export type WelcomeDraftInput = z.infer<typeof welcomeDraftSchema>;
export type WelcomeOrganizationInput = z.infer<typeof welcomeOrganizationSchema>;
