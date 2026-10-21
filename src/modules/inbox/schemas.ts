import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";
import { formatCnj, isValidCnj } from "@/lib/validation/br-documents";

const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador inválido.");

export const NOTICE_STATUSES = ["NEW", "DISTRIBUTED", "PROCESSED", "DISCARDED"] as const;
export const NOTICE_STATUS_LABEL: Record<(typeof NOTICE_STATUSES)[number], string> = { NEW: "Nova", DISTRIBUTED: "Distribuída", PROCESSED: "Tratada", DISCARDED: "Descartada" };
export const NOTICE_KINDS = ["INTIMACAO", "CITACAO", "DESPACHO", "DECISAO", "SENTENCA", "OUTRO"] as const;
export const NOTICE_KIND_LABEL: Record<(typeof NOTICE_KINDS)[number], string> = {
  INTIMACAO: "Intimação", CITACAO: "Citação", DESPACHO: "Despacho", DECISAO: "Decisão", SENTENCA: "Sentença", OUTRO: "Outro",
};
export const NOTICE_SOURCE_LABEL = { MANUAL: "Cadastro manual", PASTED: "Texto colado", FILE: "Arquivo de texto", IMPORTED: "Importada do tribunal" } as const;

export const noticeSchema = z.object({
  source: z.enum(["MANUAL", "PASTED", "FILE"]),
  kind: z.enum(NOTICE_KINDS),
  title: z.string().trim().min(3, "Informe um título (mín. 3 caracteres).").max(200),
  content: z.string().trim().min(10, "Cole ou digite o teor da intimação (mín. 10 caracteres).").max(50_000, "Máximo de 50.000 caracteres."),
  caseNumber: z.string().trim().max(40).refine((v) => v === "" || isValidCnj(v), "Número CNJ inválido (confira o dígito verificador)."),
  court: z.string().trim().max(120),
  publishedAt: z.string().refine((v) => v === "" || isYmd(v), "Data inválida."),
  receivedAt: z.string().refine(isYmd, "Informe a data de recebimento."),
  caseId: uuidOrEmpty,
});
export type NoticeInput = z.infer<typeof noticeSchema>;

export function toNoticeData(i: NoticeInput) {
  return {
    source: i.source,
    kind: i.kind,
    title: i.title.trim(),
    content: i.content.trim(),
    caseNumber: i.caseNumber ? formatCnj(i.caseNumber) : null,
    court: i.court.trim() || null,
    publishedAt: i.publishedAt ? new Date(`${i.publishedAt}T00:00:00Z`) : null,
    receivedAt: new Date(`${i.receivedAt}T00:00:00Z`),
  };
}

export const assignSchema = z.object({ userId: z.uuid("Selecione um responsável.") });
export const discardSchema = z.object({ reason: z.string().trim().min(3, "Informe o motivo (mín. 3 caracteres).").max(300) });
export const parseSchema = z.object({ text: z.string().min(1).max(50_000) });

export const EMPTY_NOTICE: NoticeInput = { source: "MANUAL", kind: "INTIMACAO", title: "", content: "", caseNumber: "", court: "", publishedAt: "", receivedAt: "", caseId: "" };
