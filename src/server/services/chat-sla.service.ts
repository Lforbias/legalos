import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ValidationError } from "@/lib/permissions/check";
import { slaSchema } from "@/modules/whatsapp/sla-schema";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { enqueueMail } from "./mail-outbox.service";
import { notify } from "./notification.service";

/**
 * SLA de resposta do LegalOS Chat. Se o cliente escreveu e ninguém da equipe respondeu em X minutos (a qualquer hora),
 * o responsável recebe um aviso interno e um e-mail; opcionalmente também uma pessoa de escalonamento.
 * NUNCA escreve ao cliente. Nasce DESLIGADO. Quando uma pessoa responde, o alerta deixa de existir sozinho (a regra é calculada
 * pelas mensagens). Cada conversa só gera um alerta por mensagem do cliente.
 */

/** Conversas cuja última mensagem do cliente tem mais de 24 horas não geram alerta (evita enxurrada ao ligar). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 15;

export async function getSla(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const org = ctx.organizationId;
  const [s, recent] = await Promise.all([
    db.whatsappSlaSettings.findUnique({ where: { organizationId: org } }),
    db.whatsappSlaAlert.findMany({ where: { organizationId: org }, orderBy: { createdAt: "desc" }, take: RECENT_LIMIT, select: { id: true, createdAt: true, recipients: true, conversationId: true, conversation: { select: { contactName: true, waId: true, client: { select: { name: true } } } } } }),
  ]);
  return {
    enabled: s?.enabled ?? false,
    minutes: s?.minutes ?? 15,
    notifyAssignee: s?.notifyAssignee ?? true,
    notifyEmail: s?.notifyEmail ?? true,
    escalateUserId: s?.escalateUserId ?? null,
    recent: recent.map((r) => ({ id: r.id, at: r.createdAt, recipients: r.recipients, conversationId: r.conversationId, who: r.conversation.client?.name ?? r.conversation.contactName ?? r.conversation.waId })),
  };
}

export async function saveSla(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "whatsapp:manage");
  const p = slaSchema.safeParse(raw);
  if (!p.success) {
    const fe: Record<string, string[]> = {};
    for (const i of p.error.issues) (fe[String(i.path[0] ?? "form")] ??= []).push(i.message);
    throw new ValidationError("Corrija os campos destacados.", fe);
  }
  const v = p.data;
  if (v.escalateUserId) {
    const m = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: v.escalateUserId, status: "ACTIVE", user: { disabledAt: null } }, select: { id: true } });
    if (!m) throw new ValidationError("Escolha um membro ativo do escritório.", { escalateUserId: ["Escolha um membro ativo do escritório."] });
  }
  if (v.enabled && !v.notifyAssignee && !v.escalateUserId) throw new ValidationError("Escolha quem será avisado: o responsável da conversa, uma pessoa de escalonamento, ou os dois.", { notifyAssignee: ["Escolha quem será avisado."] });
  const before = await db.whatsappSlaSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { enabled: true } });
  const data = { enabled: v.enabled, minutes: v.minutes, notifyAssignee: v.notifyAssignee, notifyEmail: v.notifyEmail, escalateUserId: v.escalateUserId, updatedById: ctx.userId };
  await db.whatsappSlaSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  const toggled = (before?.enabled ?? false) !== v.enabled;
  await audit({ action: toggled ? (v.enabled ? "whatsapp.sla_enable" : "whatsapp.sla_disable") : "whatsapp.sla_update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_sla", metadata: { minutes: v.minutes, notifyEmail: v.notifyEmail, assignee: v.notifyAssignee, escalation: !!v.escalateUserId }, meta: ctx.meta });
}

export type SlaRunResult = { orgs: number; alerts: number; notified: number; emails: number; noRecipient: number };

/** Rotina agendada (a cada poucos minutos). Idempotente: o alerta é único por conversa + mensagem do cliente. */
export async function runSlaCheck(now = new Date()): Promise<SlaRunResult> {
  const out: SlaRunResult = { orgs: 0, alerts: 0, notified: 0, emails: 0, noRecipient: 0 };
  const orgs = await db.whatsappSlaSettings.findMany({ where: { enabled: true, organization: { whatsappAccount: { enabled: true } } } });
  for (const s of orgs) {
    out.orgs++;
    try {
      const limit = new Date(now.getTime() - s.minutes * 60_000);
      const floor = new Date(now.getTime() - MAX_AGE_MS);
      const convs = await db.whatsappConversation.findMany({
        where: { organizationId: s.organizationId, status: "OPEN", lastInboundAt: { lte: limit, gte: floor } },
        select: { id: true, assignedToId: true, lastInboundAt: true, contactName: true, waId: true, client: { select: { name: true } }, botSession: { select: { state: true } } },
        take: 200,
      });
      for (const c of convs) {
        const inboundAt = c.lastInboundAt!;
        // Já respondido por uma pessoa depois da mensagem do cliente?
        const answered = await db.whatsappMessage.count({ where: { conversationId: c.id, direction: "OUT", automatic: false, createdAt: { gt: inboundAt } } });
        if (answered) continue;
        // Ainda em conversa com o menu automático e sem responsável: não é falta de resposta humana.
        if (!c.assignedToId && c.botSession && c.botSession.state !== "DONE") continue;
        const ids = new Set<string>();
        if (s.notifyAssignee && c.assignedToId) ids.add(c.assignedToId);
        if (s.escalateUserId) ids.add(s.escalateUserId);
        if (!ids.size) { out.noRecipient++; continue; }
        try {
          await db.whatsappSlaAlert.create({ data: { organizationId: s.organizationId, conversationId: c.id, inboundAt, recipients: ids.size } });
        } catch (e) {
          if (typeof e === "object" && e && (e as { code?: string }).code === "P2002") continue;
          throw e;
        }
        out.alerts++;
        const who = c.client?.name ?? c.contactName ?? "um contato";
        const mins = Math.max(s.minutes, Math.floor((now.getTime() - inboundAt.getTime()) / 60_000));
        const key = `chat.sla:${c.id}:${inboundAt.getTime()}`;
        const users = await db.user.findMany({ where: { id: { in: [...ids] }, disabledAt: null, memberships: { some: { organizationId: s.organizationId, status: "ACTIVE" } } }, select: { id: true, email: true } });
        for (const u of users) {
          out.notified += await notify({ organizationId: s.organizationId, userId: u.id, kind: "chat.sla", title: "Cliente sem resposta no WhatsApp", body: `${who} está esperando há ${mins} min.`, link: `/atendimento?c=${c.id}`, dedupeKey: `${key}:${u.id}` });
          if (s.notifyEmail) {
            const m = await enqueueMail({ organizationId: s.organizationId, kind: "chat_sla", to: u.email, subject: "Cliente sem resposta no WhatsApp", text: `${who} está esperando resposta há ${mins} minutos.\n\nAbra a conversa no LegalOS: /atendimento?c=${c.id}\n\nAviso automático do SLA de resposta do Chat.`, dedupeKey: `${key}:${u.id}` });
            if (m.queued) out.emails++;
          }
        }
      }
    } catch (e) {
      logger.error("chat.sla.org_failed", { organizationId: s.organizationId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
