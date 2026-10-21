/** Classificações de anexo e chaves de tipo de documento do tribunal usadas no protocolo (MNI). */
export const PETITION_ATTACHMENT_CLASSES = ["PROCURACAO", "DOCUMENTO_PESSOAL", "COMPROVANTE_RESIDENCIA", "PROVA_DOCUMENTAL", "CONTRATO", "DECISAO_ANEXA", "OUTROS"] as const;
export const PETITION_TYPE_KEYS = ["PETICAO", ...PETITION_ATTACHMENT_CLASSES] as const;
export type PetitionTypeKey = (typeof PETITION_TYPE_KEYS)[number];
export const PETITION_TYPE_LABEL: Record<PetitionTypeKey, string> = {
  PETICAO: "Petição (peça principal)",
  PROCURACAO: "Procuração",
  DOCUMENTO_PESSOAL: "Documento pessoal",
  COMPROVANTE_RESIDENCIA: "Comprovante de residência",
  PROVA_DOCUMENTAL: "Prova documental",
  CONTRATO: "Contrato",
  DECISAO_ANEXA: "Decisão / despacho",
  OUTROS: "Outros",
};
