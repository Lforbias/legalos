import { z } from "zod";
import { db } from "@/lib/db/client";
import { NotFoundError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
export const callSchema = z.object({ id: z.string().min(1).max(250), chat: z.string().regex(/^(?:lid:)?\d{5,25}$/), status: z.enum(["offer", "ringing", "accept", "reject", "timeout", "terminate"]), video: z.boolean(), at: z.date() });
export type CallEvent = z.infer<typeof callSchema>;
const LABEL: Record<CallEvent["status"], string> = { offer: "recebida", ringing: "chamando", accept: "atendida", reject: "recusada", timeout: "não atendida", terminate: "encerrada" };
/** Registra eventos recebidos do aparelho. Não inicia, atende, rejeita nem grava a ligação. */
export async function ingestQrCall(accountId: string, raw: CallEvent) {
    const event = callSchema.parse(raw);
    const a = await db.whatsappAccount.findFirst({ where: { id: accountId, provider: "QR", enabled: true }, select: { id: true, organizationId: true } });
    if (!a)
        return;
    return db.$transaction(async (tx) => {
        const key = `call:${a.id}:${event.id}`;
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
        const conversation = await tx.whatsappConversation.upsert({ where: { accountId_waId: { accountId: a.id, waId: event.chat } }, create: { accountId: a.id, organizationId: a.organizationId, waId: event.chat }, update: {}, select: { id: true, lastMessageAt: true } });
        const old = await tx.whatsappMessage.findFirst({ where: { waMessageId: key, organizationId: a.organizationId }, select: { callData: true, id: true } });
        const prev = (old?.callData ?? {}) as Record<string, unknown>;
        const terminal = ["reject", "timeout", "terminate"].includes(String(prev.state));
        const state = terminal && ["offer", "ringing", "accept"].includes(event.status) ? String(prev.state) : event.status;
        const accepted = prev.accepted === true || event.status === "accept";
        const data = { ...prev, source: "QR", state, accepted, video: prev.video === true || event.video, firstSeen: prev.firstSeen ?? event.at.toISOString(), ...(event.status === "accept" && !prev.acceptedAt ? { acceptedAt: event.at.toISOString() } : {}), ...(["reject", "timeout", "terminate"].includes(event.status) ? { endedAt: event.at.toISOString() } : {}) };
        const body = `Ligação ${data.video ? "de vídeo" : "de voz"} ${LABEL[state as CallEvent["status"]]}${state === "terminate" && accepted ? " (atendimento confirmado pelo aparelho)" : ""}.`;
        if (old)
            await tx.whatsappMessage.update({ where: { id: old.id }, data: { body, callData: data } });
        else
            await tx.whatsappMessage.create({ data: { organizationId: a.organizationId, conversationId: conversation.id, direction: "NOTE", type: "call", status: "NOTE", automatic: true, waMessageId: key, body, callData: data, createdAt: event.at } });
        if (!conversation.lastMessageAt || event.at >= conversation.lastMessageAt)
            await tx.whatsappConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: event.at, lastPreview: body } });
    });
}
/** Meta sem eventos de chamadas habilitados: anotação declarada pela equipe, identificada como manual. */
export async function recordManualCall(ctx: TenantContext, conversationId: string, raw: unknown) {
    assertCan(ctx, "whatsapp:write");
    const v = z.object({ outcome: z.enum(["ANSWERED", "MISSED", "REJECTED", "ENDED"]), direction: z.enum(["IN", "OUT"]), note: z.string().trim().max(500).default("") }).parse(raw);
    const c = await db.whatsappConversation.findFirst({ where: { id: z.uuid().parse(conversationId), organizationId: ctx.organizationId }, select: { id: true } });
    if (!c)
        throw new NotFoundError("Conversa não encontrada.");
    return db.$transaction(async (tx) => {
        const m = await tx.whatsappMessage.create({ data: { organizationId: ctx.organizationId, conversationId: c.id, direction: "NOTE", type: "call", status: "NOTE", authorId: ctx.userId, body: `Registro manual de ligação ${v.direction === "IN" ? "recebida" : "efetuada"}: ${{ ANSWERED: "atendida", MISSED: "não atendida", REJECTED: "recusada", ENDED: "encerrada" }[v.outcome]}.${v.note ? ` ${v.note}` : ""}`, callData: { source: "MANUAL", outcome: v.outcome, direction: v.direction } } });
        await audit({ action: "whatsapp.call_record", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_message", resourceId: m.id, metadata: { outcome: v.outcome, direction: v.direction }, meta: ctx.meta }, tx);
        return m.id;
    });
}
