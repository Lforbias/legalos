import { z } from "zod";
import { isValidCnj, formatCnj } from "@/lib/validation/br-documents";
import { isUf } from "@/lib/validation/br-states";
import { parseMoneyBR } from "@/lib/validation/money";

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido.");

export const CASE_STATUSES = ["ACTIVE", "SUSPENDED", "ARCHIVED", "CLOSED"] as const;
export const PARTY_ROLES = ["PLAINTIFF", "DEFENDANT", "THIRD_PARTY", "OTHER"] as const;
export const CASE_MEMBER_ROLES = ["RESPONSIBLE", "COLLABORATOR"] as const;

export const CASE_STATUS_LABEL: Record<(typeof CASE_STATUSES)[number], string> = {
  ACTIVE: "Em andamento",
  SUSPENDED: "Suspenso",
  ARCHIVED: "Arquivado",
  CLOSED: "Encerrado",
};
export const PARTY_ROLE_LABEL: Record<(typeof PARTY_ROLES)[number], string> = {
  PLAINTIFF: "Polo ativo (autor)",
  DEFENDANT: "Polo passivo (réu)",
  THIRD_PARTY: "Terceiro interessado",
  OTHER: "Outro",
};
export const CASE_AREAS = ["Cível", "Trabalhista", "Previdenciário", "Penal", "Tributário", "Família e sucessões", "Consumidor", "Administrativo", "Empresarial", "Outra"] as const;

export const caseSchema = z.object({
  number: text(30).refine((v) => v === "" || isValidCnj(v), "Número CNJ inválido. Verifique os dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO)."),
  legacyNumber: text(60),
  title: z.string().trim().min(3, "Informe um título para o processo.").max(200),
  area: text(60),
  court: text(120),
  courtUnit: text(120),
  courtState: text(2).refine((v) => v === "" || isUf(v.toUpperCase()), "UF inválida."),
  subject: text(2000),
  claimValue: text(20).refine((v) => v === "" || parseMoneyBR(v) !== null, "Valor inválido. Exemplo: 1.234,56"),
  status: z.enum(CASE_STATUSES),
  phase: text(80),
  distributedAt: text(10).refine((v) => v === "" || isDate(v), "Data inválida."),
  confidential: z.boolean(),
  notes: text(4000),
  responsibleId: uuidOrEmpty,
});
export type CaseInput = z.infer<typeof caseSchema>;

export const createCaseSchema = caseSchema.extend({
  clientId: uuidOrEmpty,
  clientRole: z.enum(PARTY_ROLES),
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const partySchema = z
  .object({
    role: z.enum(PARTY_ROLES),
    clientId: uuidOrEmpty,
    /** 3.0-F1: parte do cadastro único (adversários, advogados, órgãos). */
    registryId: uuidOrEmpty.optional(),
    /** 3.0-F1: guardar esta parte (digitada à mão) no cadastro único para reaproveitar em outros processos. */
    saveToRegistry: z.boolean().optional(),
    name: text(160),
    document: text(24),
    lawyerName: text(160),
  })
  .superRefine((v, ctx) => {
    if (v.clientId === "" && !v.registryId && v.name.length < 2) ctx.addIssue({ code: "custom", path: ["name"], message: "Informe o nome da parte ou selecione um cliente." });
  });
export type PartyInput = z.infer<typeof partySchema>;

export const noteSchema = z.object({
  title: text(120),
  description: z.string().trim().min(2, "Escreva a anotação.").max(4000),
  occurredAt: text(10).refine((v) => v === "" || isDate(v), "Data inválida."),
});
export type NoteInput = z.infer<typeof noteSchema>;

const emptyToNull = (v: string) => (v.trim() === "" ? null : v.trim());

export function toCaseData(input: CaseInput) {
  return {
    number: input.number ? formatCnj(input.number) : null,
    legacyNumber: emptyToNull(input.legacyNumber),
    title: input.title.trim(),
    area: emptyToNull(input.area),
    court: emptyToNull(input.court),
    courtUnit: emptyToNull(input.courtUnit),
    courtState: input.courtState ? input.courtState.toUpperCase() : null,
    subject: emptyToNull(input.subject),
    claimValue: input.claimValue ? parseMoneyBR(input.claimValue) : null,
    status: input.status,
    phase: emptyToNull(input.phase),
    distributedAt: input.distributedAt ? new Date(`${input.distributedAt}T00:00:00Z`) : null,
    confidential: input.confidential,
    notes: emptyToNull(input.notes),
  };
}

export const EVENT_KIND_LABEL: Record<string, string> = {
  CASE_CREATED: "Processo cadastrado",
  CASE_UPDATED: "Dados atualizados",
  STATUS_CHANGED: "Situação alterada",
  NOTE: "Anotação",
  DATAJUD_MOVEMENT: "Andamento (DataJud/CNJ)",
  ANDAMENTO: "Andamento (Astrea)",
  CUSTOM_FIELDS: "Campos personalizados",
  ACERVO_IN: "Movido para o acervo",
  ACERVO_OUT: "Devolvido à carteira",
  PARTY_ADDED: "Parte adicionada",
  PARTY_REMOVED: "Parte removida",
  MEMBER_ADDED: "Equipe: membro adicionado",
  MEMBER_REMOVED: "Equipe: membro removido",
  RESPONSIBLE_CHANGED: "Responsável alterado",
  DOCUMENT_ADDED: "Documento anexado",
  DOCUMENT_REMOVED: "Documento removido",
  TASK_CREATED: "Tarefa criada",
  TASK_DONE: "Tarefa concluída",
  TASK_REOPENED: "Tarefa reaberta",
  DEADLINE_CREATED: "Prazo cadastrado",
  DEADLINE_UPDATED: "Prazo alterado",
  DEADLINE_VALIDATE: "Prazo validado",
  DEADLINE_FULFILL: "Prazo cumprido",
  DEADLINE_CANCEL: "Prazo cancelado",
  AGENDA_CREATED: "Compromisso agendado",
  NOTICE_LINKED: "Intimação vinculada",
  NOTICE_PROCESSED: "Intimação tratada",
  PORTAL_SHARING: "Portal do cliente",
  IMPORT: "Importado de outro sistema",
  PETITION_CREATED: "Petição preparada",
  PETITION_REVIEW: "Petição em revisão",
  PETITION_APPROVED: "Petição aprovada",
  PETITION_RETURNED: "Petição devolvida",
  PETITION_SUBMITTED: "Petição enviada",
  PETITION_CANCELED: "Petição cancelada",
};
