import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";
import { onlyDigits } from "@/lib/validation/br-documents";
import { parseMoneyBR } from "@/lib/validation/money";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido.");

export const LEAD_STAGES = ["NEW", "CONTACTED", "MEETING", "PROPOSAL", "WON", "LOST"] as const;
export type LeadStageKey = (typeof LEAD_STAGES)[number];
/** Etapas que o usuário pode escolher manualmente. WON só por conversão em cliente; LOST só com motivo. */
export const OPEN_STAGES = ["NEW", "CONTACTED", "MEETING", "PROPOSAL"] as const;
export const LEAD_STAGE_LABEL: Record<LeadStageKey, string> = {
  NEW: "Novo",
  CONTACTED: "Contato feito",
  MEETING: "Reunião",
  PROPOSAL: "Proposta",
  WON: "Ganho",
  LOST: "Perdido",
};
export const LEAD_STAGE_TONE: Record<LeadStageKey, "neutral" | "info" | "warning" | "success" | "danger" | "accent"> = {
  NEW: "neutral",
  CONTACTED: "info",
  MEETING: "accent",
  PROPOSAL: "warning",
  WON: "success",
  LOST: "danger",
};

export const leadSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(160),
  type: z.enum(["PERSON", "COMPANY"]),
  email: text(254).refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido."),
  phone: text(30).refine((v) => v === "" || [10, 11, 12, 13].includes(onlyDigits(v).length), "Telefone inválido (use DDD + número)."),
  source: text(80),
  interest: text(120),
  estimatedValue: text(20).refine((v) => v === "" || parseMoneyBR(v) !== null, "Valor inválido. Exemplo: 1.234,56"),
  ownerId: uuidOrEmpty,
  nextActionDate: text(10).refine((v) => v === "" || isYmd(v), "Data inválida."),
  notes: text(4000),
});
export type LeadInput = z.infer<typeof leadSchema>;
export const EMPTY_LEAD: LeadInput = { name: "", type: "PERSON", email: "", phone: "", source: "", interest: "", estimatedValue: "", ownerId: "", nextActionDate: "", notes: "" };

export const ACTIVITY_KINDS = ["NOTE", "CALL", "EMAIL", "MEETING"] as const;
export const ACTIVITY_LABEL: Record<string, string> = { NOTE: "Anotação", CALL: "Ligação", EMAIL: "E-mail", MEETING: "Reunião", STAGE: "Etapa", PROPOSAL: "Proposta", SYSTEM: "Sistema" };
export const activitySchema = z.object({ kind: z.enum(ACTIVITY_KINDS), body: z.string().trim().min(2, "Descreva o contato.").max(2000) });
export type ActivityInput = z.infer<typeof activitySchema>;

export const lostSchema = z.object({ reason: z.string().trim().min(3, "Informe o motivo.").max(500) });
export type LostInput = z.infer<typeof lostSchema>;

export const convertSchema = z.object({ document: text(24) });
export type ConvertInput = z.infer<typeof convertSchema>;

export const PROPOSAL_STATUS_LABEL = { DRAFT: "Rascunho", SENT: "Enviada", ACCEPTED: "Aceita", REJECTED: "Recusada" } as const;
export type ProposalStatusKey = keyof typeof PROPOSAL_STATUS_LABEL;
export const proposalSchema = z.object({
  title: z.string().trim().min(3, "Informe um título.").max(160),
  amount: text(20).refine((v) => v !== "" && parseMoneyBR(v) !== null, "Informe um valor válido. Exemplo: 1.234,56"),
  description: text(4000),
  validUntil: text(10).refine((v) => v === "" || isYmd(v), "Data inválida."),
});
export type ProposalInput = z.infer<typeof proposalSchema>;
export const EMPTY_PROPOSAL: ProposalInput = { title: "", amount: "", description: "", validUntil: "" };
