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
  AWAITING_CONFIRMATION: "Enviada — falta a confirmação oficial",
  FILED_CONFIRMED: "Protocolada com confirmação oficial",
  UNKNOWN: "Estado desconhecido — confira no tribunal",
  FAILED: "Falha no envio",
  CANCELED: "Cancelada",
} as const;
export type PetitionStatusKey = keyof typeof PETITION_STATUS_LABEL;
export const PETITION_STATUS_TONE: Record<PetitionStatusKey, "neutral" | "info" | "warning" | "success" | "danger" | "accent"> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  APPROVED: "info",
  SUBMITTING: "info",
  SUBMITTED: "warning",
  AWAITING_CONFIRMATION: "warning",
  FILED_CONFIRMED: "success",
  UNKNOWN: "danger",
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

export const reconcileFiledSchema = z.object({
  protocol: z.string().trim().min(3, "Informe o número do protocolo.").max(60, "Máximo de 60 caracteres."),
  receiptDocumentId: z.uuid("Escolha o documento do recibo."),
  note: z.string().trim().max(1000, "Máximo de 1000 caracteres.").optional(),
});
export const reconcileNotFiledSchema = z.object({ note: z.string().trim().min(10, "Explique onde conferiu (mín. 10 caracteres).").max(1000, "Máximo de 1000 caracteres.") });
