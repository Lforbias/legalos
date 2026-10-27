import { z } from "zod";

export const AI_MODES = ["reply", "rewrite", "translate", "classify", "closing"] as const;
export const aiAssistSchema = z.object({
  conversationId: z.uuid(), mode: z.enum(AI_MODES),
  text: z.string().trim().max(4096).default(""),
  language: z.string().trim().min(2).max(40).default("Português"),
});
export const viewSchema = z.object({
  f: z.enum(["open", "mine", "unassigned", "closed"]).optional(),
  q: z.string().max(100).optional(), fila: z.uuid().optional(),
  etq: z.uuid().optional(), num: z.uuid().optional(),
  s: z.enum(["OPEN", "IN_SERVICE", "WAITING", "RESOLVED", "CLOSED", "UNDEFINED"]).optional(),
});
export const macroSchema = z.object({
  note: z.string().trim().max(1000).default(""),
  draft: z.string().trim().max(4096).default(""),
  labelIds: z.array(z.uuid()).max(20).default([]),
  queueId: z.uuid().nullable().default(null),
  status: z.enum(["OPEN", "IN_SERVICE", "WAITING", "RESOLVED", "CLOSED", "UNDEFINED"]).optional(),
}).refine(v => v.note || v.draft || v.labelIds.length || v.queueId || v.status, "Adicione ao menos uma ação.");
export const resourceSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("KNOWLEDGE"), name: z.string().trim().min(3).max(100), payload: z.object({body: z.string().trim().min(10).max(12000)})}),
  z.object({kind: z.literal("MACRO"), name: z.string().trim().min(3).max(100), payload: macroSchema}),
  z.object({kind: z.literal("VIEW"), name: z.string().trim().min(3).max(100), payload: viewSchema}),
]);
export type ChatResource = {id: string; kind: "KNOWLEDGE" | "MACRO" | "VIEW"; name: string; payload: Record<string, unknown>};
/** Stable per conversation; full UUID avoids collisions and does not reveal a phone. */
export function attendanceProtocol(id: string, createdAt: Date | string) {
  return `ATD-${new Date(createdAt).toISOString().slice(0,10).replaceAll("-", "")}-${id.toUpperCase()}`;
}
export function viewHref(payload: unknown) {
  const v = viewSchema.parse(payload);
  return `/atendimento?${new URLSearchParams(Object.entries(v).filter(([, value]) => value !== undefined) as [string,string][]).toString()}`;
}
export const classificationSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "UNCERTAIN"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]),
  reason: z.string().max(1000), queueId: z.uuid().nullable(),
  labelIds: z.array(z.uuid()).max(20), closingReason: z.string().max(500).default(""),
});
