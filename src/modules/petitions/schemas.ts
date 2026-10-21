import { z } from "zod";

export const petitionSchema = z.object({
  caseId: z.uuid("Escolha o processo."),
  documentId: z.uuid("Escolha o documento da petição."),
  title: z.string().trim().min(3, "Informe um título (mín. 3 caracteres).").max(200, "Máximo de 200 caracteres."),
  kind: z.string().trim().max(80, "Máximo de 80 caracteres."),
  court: z.string().trim().max(200, "Máximo de 200 caracteres."),
});
export type PetitionFormInput = z.infer<typeof petitionSchema>;

export const returnSchema = z.object({ note: z.string().trim().min(3, "Explique o que precisa ser ajustado.").max(1000, "Máximo de 1000 caracteres.") });
export type ReturnInput = z.infer<typeof returnSchema>;

export const PETITION_STATUS_LABEL = {
  DRAFT: "Rascunho",
  IN_REVIEW: "Em revisão",
  APPROVED: "Aprovada",
  SUBMITTING: "Enviando…",
  SUBMITTED: "Enviada",
  FAILED: "Falha no envio",
  CANCELED: "Cancelada",
} as const;
export type PetitionStatusKey = keyof typeof PETITION_STATUS_LABEL;
export const PETITION_STATUS_TONE: Record<PetitionStatusKey, "neutral" | "info" | "warning" | "success" | "danger" | "accent"> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  APPROVED: "info",
  SUBMITTING: "info",
  SUBMITTED: "success",
  FAILED: "danger",
  CANCELED: "neutral",
};

export const ATTACHMENT_CLASS_LABEL = {
  PROCURACAO: "Procuração",
  DOCUMENTO_PESSOAL: "Documento pessoal",
  COMPROVANTE_RESIDENCIA: "Comprovante de residência",
  PROVA_DOCUMENTAL: "Prova documental",
  CONTRATO: "Contrato",
  DECISAO_ANEXA: "Decisão / despacho",
  OUTROS: "Outros",
} as const;
export type AttachmentClassKey = keyof typeof ATTACHMENT_CLASS_LABEL;
export const attachmentSchema = z.object({
  documentId: z.uuid("Escolha o documento."),
  classification: z.enum(Object.keys(ATTACHMENT_CLASS_LABEL) as [AttachmentClassKey, ...AttachmentClassKey[]], { message: "Escolha a classificação." }),
});
export type AttachmentInput = z.infer<typeof attachmentSchema>;
