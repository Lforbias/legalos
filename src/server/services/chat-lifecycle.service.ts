import { emitChatEvent } from "./chat-workbench.service";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { NotFoundError } from "@/lib/permissions/check";
import { SERVICE_STATUSES, SERVICE_STATUS_LABEL, isClosedService, inboundTransition, type ServiceStatus } from "@/lib/whatsapp/lifecycle";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
export async function setServiceStatus(ctx: TenantContext, id: string, raw: string) {
    assertCan(ctx, "whatsapp:write");
    z.uuid().parse(id);
    const status = z.enum(SERVICE_STATUSES).parse(raw);
    const previous = await db.$transaction(async (tx) => {
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`chat:${id}`},0))`;
        const c = await tx.whatsappConversation.findFirst({ where: { id, organizationId: ctx.organizationId } });
        if (!c)
            throw new NotFoundError("Conversa não encontrada.");
        const closed = isClosedService(status);
        await tx.whatsappConversation.update({ where: { id }, data: { serviceStatus: status, status: closed ? "CLOSED" : "OPEN", closedAt: closed ? c.closedAt ?? new Date() : null } });
        if (c.serviceStatus !== status)
            await tx.whatsappMessage.create({ data: { organizationId: ctx.organizationId, conversationId: id, direction: "NOTE", type: "text", status: "NOTE", authorId: ctx.userId, body: `Atendimento: ${SERVICE_STATUS_LABEL[c.serviceStatus as ServiceStatus] ?? c.serviceStatus} → ${SERVICE_STATUS_LABEL[status]}.` } });
        await audit({ action: "whatsapp.service_status", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: id, metadata: { from: c.serviceStatus, to: status }, meta: ctx.meta }, tx);
        return c.status;
    });
    await emitChatEvent(ctx.organizationId,"chat.conversation.updated",{conversationId:id,serviceStatus:status}).catch(()=>0);
    if (isClosedService(status) && previous !== "CLOSED") {
        const { autoSurveyOnClose } = await import("./chat-extras.service");
        await autoSurveyOnClose(ctx.organizationId, id, ctx.userId).catch(() => undefined);
    }
}
export async function applyInboundLifecycle(organizationId: string, conversationId: string, at: Date) {
    return db.$transaction(async (tx) => {
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`chat:${conversationId}`},0))`;
        const c = await tx.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, include: { account: { select: { autoStatusEnabled: true, reopenAfterMinutes: true, reassignOnReopen: true } } } });
        if (!c)
            throw new NotFoundError("Conversa não encontrada.");
        // Webhooks da Meta usam segundos; a comparação tolera apenas a fração de segundo local.
        // Uma mensagem atrasada não deve reabrir um atendimento encerrado depois dela.
        if (c.lastMessageAt && at.getTime() + 999 < c.lastMessageAt.getTime() || c.closedAt && at.getTime() + 999 < c.closedAt.getTime())
            return { reassign: false, reopened: false, stale: true };
        const t = inboundTransition(c, c.account, at);
        await tx.whatsappConversation.update({ where: { id: c.id }, data: { status: t.status, serviceStatus: t.serviceStatus, closedAt: null, ...(t.reassign ? { assignedToId: null, assignedAt: null } : {}) } });
        if (t.reassign)
            await tx.whatsappMessage.create({ data: { organizationId, conversationId, direction: "NOTE", type: "text", status: "NOTE", automatic: true, body: `Atendimento reiniciado após ${c.account.reopenAfterMinutes} minutos; conversa devolvida à distribuição da fila.` } });
        return { reassign: t.reassign, reopened: c.status === "CLOSED", stale: false };
    });
}
/** Só uma resposta humana aceita pelo transporte inicia o atendimento. Automações e notas não alteram a situação. */
export async function humanReplyLifecycle(organizationId: string, id: string) {
    await db.whatsappConversation.updateMany({ where: { id, organizationId, account: { autoStatusEnabled: true } }, data: { status: "OPEN", serviceStatus: "IN_SERVICE", closedAt: null } });
}
export async function saveLifecycleSettings(ctx: TenantContext, id: string, raw: unknown) {
    assertCan(ctx, "whatsapp:manage");
    const data = z.object({ autoStatusEnabled: z.boolean(), reopenAfterMinutes: z.number().int().min(1).max(10080), reassignOnReopen: z.boolean() }).parse(raw);
    const r = await db.whatsappAccount.updateMany({ where: { id: z.uuid().parse(id), organizationId: ctx.organizationId }, data });
    if (!r.count)
        throw new NotFoundError("Número não encontrado.");
    await audit({ action: "whatsapp.lifecycle_settings", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_account", resourceId: id, metadata: data, meta: ctx.meta });
}
