import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";
import { NOTICE_KINDS } from "./schemas";

export const ORIGIN_LABEL = { DJEN: "Captura DJEN", MNI: "Captura PJe/MNI", OTHER_IMPORT: "Outras importações", MANUAL: "Cadastro manual", PASTED: "Texto colado", FILE: "Arquivo de texto" } as const;
const date = z.string().refine(isYmd, "Informe uma data válida.").optional();
export const noticeListOptionsSchema = z.object({
  kind: z.enum(NOTICE_KINDS).optional(),
  origin: z.enum(["DJEN", "MNI", "OTHER_IMPORT", "MANUAL", "PASTED", "FILE"]).optional(),
  court: z.string().trim().max(120).optional(),
  receivedFrom: date, receivedTo: date, publishedFrom: date, publishedTo: date,
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().pipe(z.union([z.literal(25), z.literal(50), z.literal(100), z.literal(200)])).default(50),
  sort: z.enum(["desc", "asc"]).default("desc"),
}).superRefine((v, ctx) => {
  for (const [from, to] of [["receivedFrom", "receivedTo"], ["publishedFrom", "publishedTo"]] as const) {
    if (v[from] && v[to] && v[from]! > v[to]!) ctx.addIssue({ code: "custom", path: [to], message: "A data final deve ser igual ou posterior à inicial." });
  }
});

const selection = z.object({ id: z.uuid(), updatedAt: z.iso.datetime() });
const base = { selection: z.array(selection).min(1, "Selecione ao menos uma intimação.").max(100, "Selecione no máximo 100 intimações.").refine(v => new Set(v.map(n => n.id)).size === v.length, "Seleção repetida.") };
export const bulkNoticeSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("ASSIGN_USER"), userId: z.uuid("Escolha um responsável.") }),
  z.object({ ...base, action: z.literal("ASSIGN_TEAM"), teamId: z.uuid("Escolha uma equipe.") }),
  z.object({ ...base, action: z.literal("ADD_TAGS"), tags: z.array(z.string().trim().min(1).max(30)).min(1).max(10) }),
  z.object({ ...base, action: z.literal("PROCESS") }),
  z.object({ ...base, action: z.literal("SNOOZE"), until: z.string().refine(isYmd, "Escolha uma data válida.") }),
]);
export type BulkNoticeInput = z.infer<typeof bulkNoticeSchema>;
