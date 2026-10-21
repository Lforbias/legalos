import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { logger } from "@/lib/logging/logger";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { isOutsideHours } from "@/lib/whatsapp/hours";
import { formatWaId } from "@/lib/whatsapp/phone";
import { automationSchema, chatActionSchema, type ChatAction, type ChatTrigger } from "@/modules/whatsapp/automation-schema";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { autoAssign } from "./chat-queue.service";
import { isUniqueViolation } from "./db-errors";
import { notify } from "./notification.service";
import { getTransport } from "./whatsapp-transport";

/**
 * LegalOS Chat — automações: um GATILHO e até 5 AÇÕES.
 * Roda "como o sistema", sem exigir permissão de quem disparou; NUNCA lança erro nem atrapalha o recebimento da mensagem.
 * Idempotente: (automação, conversa, chave do evento) é único. Por padrão a automação roda uma vez por conversa.
 * Proteções: a automação não dispara outras (etiqueta colocada por automação não aciona "etiqueta colocada") e
 * o envio automático de resposta tem teto de 3 por conversa a cada 10 minutos.
 */

const REPLY_CAP = 3;
const REPLY_WINDOW_MS = 10 * 60 * 1000;

export type ChatEvent = { trigger: ChatTrigger; eventKey: string; text?: string | null; labelId?: string; actorId?: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const parseKeywords = (raw: string | null | undefined) => [...new Set((raw ?? "").split(/[,\n;]/).map((k) => k.trim()).filter(Boolean))];

// ---------------- gestão ----------------

export async function listAutomations(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const rows = await db.whatsappAutomation.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, include: { _count: { select: { runs: true } } } });
  return rows.map((r) => ({ id: r.id, name: r.name, trigger: r.trigger as ChatTrigger, triggerValue: r.triggerValue, actions: chatActionSchema.array().catch([]).parse(r.actions), oncePerConversation: r.oncePerConversation, active: r.active, runs: r._count.runs }));
}

export async function listAutomationRuns(ctx: TenantContext, limit = 30) {
  assertCan(ctx, "whatsapp:manage");
  return db.whatsappAutomationRun.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, status: true, message: true, createdAt: true, conversationId: true, automation: { select: { name: true } }, conversation: { select: { contactName: true, waId: true, client: { select: { name: true } } } } } });
}

export async function validateRefs(ctx: TenantContext, trigger: ChatTrigger, actions: ChatAction[]) {
  const org = ctx.organizationId;
  const fail = (m: string) => new ValidationError(m, { actions: [m] });
  if (actions.filter((a) => a.type === "SEND_REPLY").length > 1) throw fail("Use no máximo uma resposta automática por automação.");
  if (trigger === "LABEL_ADDED" && actions.some((a) => a.type === "SEND_REPLY")) throw fail("Resposta ao cliente não combina com “etiqueta colocada” (a conversa pode estar fora da janela de 24 horas).");
  for (const a of actions) {
    if (a.type === "ADD_LABEL" && !(await db.whatsappLabel.findFirst({ where: { id: a.labelId, organizationId: org }, select: { id: true } }))) throw fail("Etiqueta não encontrada.");
    if (a.type === "TRANSFER_QUEUE" && !(await db.whatsappQueue.findFirst({ where: { id: a.queueId, organizationId: org, active: true }, select: { id: true } }))) throw fail("Fila não encontrada ou desativada.");
    const uid = a.type === "ASSIGN" || a.type === "NOTIFY" ? a.userId : a.type === "CREATE_TASK" ? a.assigneeId : null;
    if (uid) {
      const m = await db.membership.findFirst({ where: { organizationId: org, userId: uid, status: "ACTIVE", user: { disabledAt: null }, ...(a.type === "ASSIGN" ? { role: { permissions: { has: "whatsapp:write" } } } : {}) }, select: { id: true } });
      if (!m) throw fail(a.type === "ASSIGN" ? "Escolha um atendente ativo com acesso ao Chat." : "Escolha um membro ativo do escritório.");
    }
  }
}

export async function saveAutomation(ctx: TenantContext, id: string | null, raw: unknown) {
  assertCan(ctx, "whatsapp:manage");
  const parsed = automationSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fieldErrors[String(i.path[0] ?? "form")] ??= []).push(i.message);
    throw new ValidationError("Corrija os campos destacados.", fieldErrors);
  }
  const v = parsed.data;
  let triggerValue: string | null = null;
  if (v.trigger === "KEYWORD") {
    const kws = parseKeywords(v.triggerValue);
    if (kws.length < 1 || kws.length > 20 || kws.some((k) => k.length < 2 || k.length > 40)) throw new ValidationError("Informe de 1 a 20 palavras (2 a 40 letras cada).", { triggerValue: ["Informe de 1 a 20 palavras (2 a 40 letras cada), separadas por vírgula."] });
    triggerValue = kws.join(", ");
  } else if (v.trigger === "LABEL_ADDED") {
    const l = v.triggerValue ? await db.whatsappLabel.findFirst({ where: { id: v.triggerValue, organizationId: ctx.organizationId }, select: { id: true } }) : null;
    if (!l) throw new ValidationError("Escolha a etiqueta.", { triggerValue: ["Escolha uma etiqueta do escritório."] });
    triggerValue = l.id;
  }
  await validateRefs(ctx, v.trigger, v.actions);
  const data = { name: v.name, trigger: v.trigger, triggerValue, actions: v.actions as unknown as Prisma.InputJsonValue, oncePerConversation: v.oncePerConversation, active: v.active };
  try {
    let saved: { id: string };
    if (id) {
      const res = await db.whatsappAutomation.updateMany({ where: { id, organizationId: ctx.organizationId }, data });
      if (res.count !== 1) throw new NotFoundError("Automação não encontrada.");
      saved = { id };
    } else {
      saved = await db.whatsappAutomation.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId }, select: { id: true } });
    }
    await audit({ action: id ? "whatsapp.automation_update" : "whatsapp.automation_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_automation", resourceId: saved.id, metadata: { trigger: v.trigger, actions: v.actions.map((a) => a.type) }, meta: ctx.meta });
    return saved;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Já existe uma automação com esse nome.", { name: ["Já existe uma automação com esse nome."] });
    throw e;
  }
}

export async function setAutomationActive(ctx: TenantContext, id: string, active: boolean) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappAutomation.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { active } });
  if (r.count !== 1) throw new NotFoundError("Automação não encontrada.");
  await audit({ action: active ? "whatsapp.automation_enable" : "whatsapp.automation_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_automation", resourceId: id, meta: ctx.meta });
}

export async function deleteAutomation(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappAutomation.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Automação não encontrada.");
  await audit({ action: "whatsapp.automation_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_automation", resourceId: id, meta: ctx.meta });
}

// ---------------- execução ----------------

type Conv = { id: string; waId: string; contactName: string | null; clientName: string | null; clientId: string | null; caseId: string | null };

async function runActions(organizationId: string, conv: Conv, ruleName: string, ruleId: string, ev: ChatEvent, actions: ChatAction[]) {
  const who = conv.clientName ?? conv.contactName ?? formatWaId(conv.waId);
  const subst = (t: string) => t.replaceAll("{{contato}}", who).replaceAll("{{mensagem}}", (ev.text ?? "").replace(/\s+/g, " ").slice(0, 100));
  const done: string[] = [];
  const failed: string[] = [];
  for (const a of actions) {
    try {
      if (a.type === "ADD_LABEL") {
        const l = await db.whatsappLabel.findFirst({ where: { id: a.labelId, organizationId }, select: { id: true, name: true } });
        if (!l) throw new Error("etiqueta não existe mais");
        const r = await db.whatsappConversationLabel.createMany({ data: [{ conversationId: conv.id, labelId: l.id, organizationId }], skipDuplicates: true });
        done.push(r.count ? `etiqueta “${l.name}”` : `etiqueta “${l.name}” (já estava)`);
      } else if (a.type === "TRANSFER_QUEUE") {
        const q = await db.whatsappQueue.findFirst({ where: { id: a.queueId, organizationId, active: true }, select: { id: true, name: true } });
        if (!q) throw new Error("fila não existe ou está desativada");
        await db.whatsappConversation.update({ where: { id: conv.id }, data: { queueId: q.id, assignedToId: null, assignedAt: null } });
        const agent = await autoAssign(organizationId, conv.id, { force: true });
        done.push(`fila “${q.name}”${agent ? ` → ${agent.name}` : " (aguardando atendente)"}`);
      } else if (a.type === "ASSIGN") {
        const m = await db.membership.findFirst({ where: { organizationId, userId: a.userId, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "whatsapp:write" } } }, select: { user: { select: { name: true } } } });
        if (!m) throw new Error("atendente indisponível");
        await db.whatsappConversation.update({ where: { id: conv.id }, data: { assignedToId: a.userId, assignedAt: new Date() } });
        await notify({ organizationId, userId: a.userId, kind: "chat.assigned", title: "Nova conversa para você", body: `Automação “${ruleName}”.`, link: `/atendimento?c=${conv.id}`, dedupeKey: `chat.assigned:${conv.id}:${a.userId}:${ruleId}` }).catch(() => 0);
        done.push(`atribuída a ${m.user.name}`);
      } else if (a.type === "CREATE_TASK") {
        const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
        let assigneeId = a.assigneeId;
        if (!assigneeId) assigneeId = (await db.whatsappConversation.findUnique({ where: { id: conv.id }, select: { assignedToId: true } }))?.assignedToId ?? null;
        if (assigneeId && !(await db.membership.findFirst({ where: { organizationId, userId: assigneeId, status: "ACTIVE" }, select: { id: true } }))) assigneeId = null;
        const title = subst(a.title).slice(0, 200);
        const t = await db.task.create({
          data: {
            organizationId, title,
            description: `Criada automaticamente pela automação “${ruleName}”.\nOrigem: conversa de WhatsApp com ${who} (/atendimento?c=${conv.id}).${ev.text ? `\nMensagem: “${ev.text.replace(/\s+/g, " ").slice(0, 300)}”` : ""}`.slice(0, 4000),
            dueDate: ymdToDate(addDays(todayYmd(org.timezone), a.dueDays)), assigneeId, clientId: conv.clientId, caseId: conv.caseId,
          },
        });
        if (assigneeId) await notify({ organizationId, userId: assigneeId, kind: "task.assigned", title: "Nova tarefa automática", body: t.title, link: `/tarefas/${t.id}`, dedupeKey: `task.assigned:${t.id}` }).catch(() => 0);
        done.push(`tarefa “${t.title}”${assigneeId ? "" : " (sem responsável)"}`);
      } else if (a.type === "SEND_REPLY") {
        const recent = await db.whatsappMessage.count({ where: { conversationId: conv.id, organizationId, direction: "OUT", automatic: true, createdAt: { gt: new Date(Date.now() - REPLY_WINDOW_MS) } } });
        if (recent >= REPLY_CAP) throw new Error("limite de respostas automáticas atingido (proteção contra repetição)");
        const text = subst(a.text);
        const t = await getTransport(organizationId);
        const id = await t.sendText(conv.waId, text);
        await db.whatsappMessage.create({ data: { organizationId, conversationId: conv.id, direction: "OUT", type: "text", body: text, status: "SENT", waMessageId: id, automatic: true } });
        done.push("resposta enviada");
      } else if (a.type === "NOTIFY") {
        const m = await db.membership.findFirst({ where: { organizationId, userId: a.userId, status: "ACTIVE", user: { disabledAt: null } }, select: { user: { select: { name: true } } } });
        if (!m) throw new Error("membro indisponível");
        await notify({ organizationId, userId: a.userId, kind: "chat.automation", title: `Automação “${ruleName}”`, body: `Conversa com ${who}.`, link: `/atendimento?c=${conv.id}`, dedupeKey: `chat.automation:${ruleId}:${conv.id}:${ev.eventKey}` });
        done.push(`aviso para ${m.user.name}`);
      }
    } catch (e) {
      logger.warn("whatsapp.automation_action_failed", { ruleId, type: a.type, error: e instanceof Error ? e.message : String(e) });
      failed.push(`${a.type === "SEND_REPLY" ? "resposta" : a.type === "CREATE_TASK" ? "tarefa" : a.type === "NOTIFY" ? "aviso" : a.type === "ASSIGN" ? "atribuição" : a.type === "TRANSFER_QUEUE" ? "fila" : "etiqueta"} não feita (${e instanceof Error ? e.message : "erro"})`);
    }
  }
  return { done, failed };
}

/** Executa as automações ativas do evento. Melhor esforço: nunca lança. Devolve quantas rodaram. */
export async function runChatAutomations(organizationId: string, conversationId: string, ev: ChatEvent): Promise<number> {
  let ran = 0;
  try {
    const rules = await db.whatsappAutomation.findMany({ where: { organizationId, trigger: ev.trigger, active: true }, orderBy: { createdAt: "asc" }, take: 20 });
    if (rules.length === 0) return 0;
    const c = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { id: true, waId: true, contactName: true, clientId: true, caseId: true, client: { select: { name: true } } } });
    if (!c) return 0;
    const conv: Conv = { id: c.id, waId: c.waId, contactName: c.contactName, clientName: c.client?.name ?? null, clientId: c.clientId, caseId: c.caseId };
    const text = ev.text ? norm(ev.text) : "";
    for (const rule of rules) {
      if (rule.trigger === "KEYWORD" && !(text && parseKeywords(rule.triggerValue).some((k) => text.includes(norm(k))))) continue;
      if (rule.trigger === "LABEL_ADDED" && rule.triggerValue !== ev.labelId) continue;
      const key = rule.oncePerConversation ? "once" : ev.eventKey;
      const claim = await db.whatsappAutomationRun.createMany({ data: [{ organizationId, automationId: rule.id, conversationId, eventKey: key, status: "DONE", message: "Em execução" }], skipDuplicates: true });
      if (claim.count === 0) continue;
      const actions = chatActionSchema.array().catch([]).parse(rule.actions);
      const { done, failed } = await runActions(organizationId, conv, rule.name, rule.id, ev, actions);
      const status = failed.length === 0 ? "DONE" : done.length === 0 ? "FAILED" : "PARTIAL";
      const message = [...done, ...failed].join("; ").slice(0, 900) || "Nada a fazer.";
      await db.whatsappAutomationRun.updateMany({ where: { automationId: rule.id, conversationId, eventKey: key }, data: { status, message } });
      await db.whatsappMessage.create({ data: { organizationId, conversationId, direction: "NOTE", type: "text", body: `Automação “${rule.name}”: ${message}.`, status: "NOTE" } }).catch(() => undefined);
      ran++;
    }
  } catch (e) {
    logger.error("whatsapp.automation_failed", { trigger: ev.trigger, error: e instanceof Error ? e.message : String(e) });
  }
  return ran;
}

/** Chamado pela recepção de uma mensagem do cliente (já salva e distribuída). */
export async function runInboundAutomations(
  account: { organizationId: string; openFrom: string; openUntil: string; openDays: number[] },
  conversationId: string,
  m: { created: boolean; text: string | null; messageKey: string; now: Date },
): Promise<void> {
  try {
    const any = await db.whatsappAutomation.count({ where: { organizationId: account.organizationId, active: true } });
    if (any === 0) return;
    if (m.created) await runChatAutomations(account.organizationId, conversationId, { trigger: "NEW_CONVERSATION", eventKey: "new", text: m.text });
    const org = await db.organization.findUnique({ where: { id: account.organizationId }, select: { timezone: true } });
    if (org && isOutsideHours(m.now, org.timezone, account.openFrom, account.openUntil, account.openDays)) await runChatAutomations(account.organizationId, conversationId, { trigger: "OUTSIDE_HOURS", eventKey: m.messageKey, text: m.text });
    if (m.text) await runChatAutomations(account.organizationId, conversationId, { trigger: "KEYWORD", eventKey: m.messageKey, text: m.text });
  } catch (e) {
    logger.error("whatsapp.automation_inbound_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Executa uma lista de ações sobre uma conversa (usado também pelo menu de triagem). Nunca lança. */
export async function runActionsOnConversation(organizationId: string, conversationId: string, name: string, sourceId: string, ev: ChatEvent, actions: ChatAction[]): Promise<{ done: string[]; failed: string[] }> {
  const c = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId }, select: { id: true, waId: true, contactName: true, clientId: true, caseId: true, client: { select: { name: true } } } });
  if (!c) return { done: [], failed: ["conversa não encontrada"] };
  return runActions(organizationId, { id: c.id, waId: c.waId, contactName: c.contactName, clientName: c.client?.name ?? null, clientId: c.clientId, caseId: c.caseId }, name, sourceId, ev, actions);
}
