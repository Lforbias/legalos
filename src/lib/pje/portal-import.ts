import { z } from "zod";
import { isValidCnj, formatCnj } from "@/lib/validation/br-documents";
import { isYmd } from "@/lib/dates/ymd";
import { hashRaw } from "@/lib/judicial/communication";

// One observed and authenticated layout at a time. Never accept arbitrary court URLs.
export const TRF3_PANEL_ORIGIN = "https://pje1g.trf3.jus.br";
export const portalNoticeSchema = z.object({
  caseNumber: z.string().max(30).refine(isValidCnj).transform(formatCnj),
  reference: z.string().regex(/^\d{1,20}$/),
  title: z.string().trim().min(3).max(120),
  communicatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).refine(v => isYmd(v.slice(0, 10)) && Number(v.slice(11, 13)) < 24 && Number(v.slice(14)) < 60),
}).strict();
export const portalNoticeBatchSchema = z.object({
  sourceOrigin: z.literal(TRF3_PANEL_ORIGIN),
  sourcePath: z.literal("/pje/Painel/painel_usuario/advogado.seam"),
  confirmed: z.literal(true),
  items: z.array(portalNoticeSchema).min(1).max(50),
}).strict();
export type PortalNotice = z.infer<typeof portalNoticeSchema>;
/** Identity of an observation, NOT an official expedition identifier or receipt. */
export function portalObservationKey(item: PortalNotice) {
  return `portal-observed:trf3-1g:${hashRaw({ cnj: item.caseNumber, reference: item.reference, communicatedAt: item.communicatedAt })}`;
}
