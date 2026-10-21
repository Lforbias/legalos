import { z } from "zod";

export const DOCUMENT_CATEGORIES = ["PETICAO", "PROCURACAO", "CONTRATO", "DECISAO", "COMPROVANTE", "IDENTIFICACAO", "OUTROS"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  PETICAO: "Petição",
  PROCURACAO: "Procuração",
  CONTRATO: "Contrato",
  DECISAO: "Decisão / intimação",
  COMPROVANTE: "Comprovante",
  IDENTIFICACAO: "Documento de identificação",
  OUTROS: "Outros",
};

export const documentMetaSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(150, "Máximo de 150 caracteres."),
  category: z.string().refine((v) => v === "" || (DOCUMENT_CATEGORIES as readonly string[]).includes(v), "Categoria inválida."),
  description: z.string().trim().max(1000, "Máximo de 1000 caracteres."),
});
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;
