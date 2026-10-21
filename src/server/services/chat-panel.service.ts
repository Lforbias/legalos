import { db } from "@/lib/db/client";
import { NotFoundError } from "@/lib/permissions/check";
import { todayYmd } from "@/lib/dates/ymd";
import { fromCents, toCents } from "@/lib/finance/money";
import { formatWaId } from "@/lib/whatsapp/phone";
import { can, type TenantContext, assertCan } from "@/server/context";
import { caseVisibility } from "./case.service";

/**
 * Painel lateral do Chat: tudo o que o sistema sabe sobre quem está falando, num só lugar.
 * Cada bloco só aparece se o usuário tem a permissão do módulo de origem; processo sigiloso que ele não vê não vaza por aqui.
 */

const AUDIT_LABEL: Record<string, string> = {
  "whatsapp.assign": "Responsável alterado",
  "whatsapp.transfer_queue": "Transferida de fila",
  "whatsapp.link_client": "Cliente vinculado ou desvinculado",
  "whatsapp.link_case": "Processo vinculado ou desvinculado",
  "whatsapp.create_lead": "Lead criado no CRM",
  "whatsapp.labels_set": "Etiquetas alteradas",
  "whatsapp.fields_set": "Campos personalizados alterados",
};
export const HISTORY_KINDS = ["ACTION", "AUTOMATION", "BILLING", "BOT"] as const;
export type HistoryItem = { id: string; at: Date; kind: (typeof HISTORY_KINDS)[number]; text: string };

export type PanelData = {
  stats: { firstContact: Date; lastInboundAt: Date | null; incoming: number; outgoing: number; notes: number; firstReplyMinutes: number | null };
  client: { id: string; name: string; type: string; status: string; document: string | null; email: string | null; phone: string | null } | null;
  lead: { id: string; name: string; stage: string; interest: string | null; estimatedValue: string | null; nextActionDate: string | null } | null;
  otherConversations: { id: string; phone: string; status: string; lastMessageAt: Date | null }[];
  caseInfo: { id: string; number: string | null; title: string; status: string; area: string | null; court: string | null; phase: string | null; claimValue: string | null; recent: { id: string; title: string; kind: string; at: Date }[] } | null;
  agenda: {
    tasks: { id: string; title: string; status: string; priority: string; due: string | null; overdue: boolean }[];
    deadlines: { id: string; title: string; status: string; due: string; caseId: string; overdue: boolean }[];
    events: { id: string; title: string; kind: string; startsAt: Date }[];
  } | null;
  finance: { openTotal: string; overdueTotal: string; overdueCount: number; entries: { id: string; description: string; due: string; remaining: string; overdue: boolean; installment: string | null }[] } | null;
  history: HistoryItem[];
};

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function conversationPanel(ctx: TenantContext, conversationId: string): Promise<PanelData> {
  assertCan(ctx, "whatsapp:read");
  const org = ctx.organizationId;
  const conv = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId: org }, select: { id: true, createdAt: true, lastInboundAt: true, clientId: true, caseId: true, leadId: true } });
  if (!conv) throw new NotFoundError("Conversa não encontrada.");
  const today = todayYmd(ctx.timezone);
  const todayDate = new Date(`${today}T00:00:00Z`);

  const [counts, firstIn, client, lead, others, caseRow, runs, sends, audits, bot] = await Promise.all([
    db.whatsappMessage.groupBy({ by: ["direction"], where: { conversationId, organizationId: org }, _count: { _all: true } }),
    db.whatsappMessage.findFirst({ where: { conversationId, organizationId: org, direction: "IN" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    conv.clientId && can(ctx, "clients:read") ? db.client.findFirst({ where: { id: conv.clientId, organizationId: org, deletedAt: null }, select: { id: true, name: true, type: true, status: true, document: true, email: true, phone: true } }) : null,
    conv.leadId && can(ctx, "crm:read") ? db.lead.findFirst({ where: { id: conv.leadId, organizationId: org, deletedAt: null }, select: { id: true, name: true, stage: true, interest: true, estimatedValue: true, nextActionDate: true } }) : null,
    conv.clientId ? db.whatsappConversation.findMany({ where: { organizationId: org, clientId: conv.clientId, id: { not: conversationId } }, orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 5, select: { id: true, waId: true, status: true, lastMessageAt: true } }) : [],
    conv.caseId && can(ctx, "cases:read") ? db.case.findFirst({ where: { AND: [{ id: conv.caseId, organizationId: org, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true, number: true, title: true, status: true, area: true, court: true, phase: true, claimValue: true } }) : null,
    db.whatsappAutomationRun.findMany({ where: { conversationId, organizationId: org }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, message: true, createdAt: true, automation: { select: { name: true } } } }),
    can(ctx, "finance:read") ? db.whatsappBillingSend.findMany({ where: { conversationId, organizationId: org }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, kind: true, offsetDays: true, createdAt: true } }) : [],
    db.auditLog.findMany({ where: { organizationId: org, resourceType: "whatsapp_conversation", resourceId: conversationId, action: { in: Object.keys(AUDIT_LABEL) } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, createdAt: true, user: { select: { name: true } } } }),
    db.whatsappBotSession.findUnique({ where: { conversationId }, select: { state: true, startedAt: true, updatedAt: true } }),
  ]);

  const count = (d: string) => counts.find((c) => c.direction === d)?._count._all ?? 0;
  let firstReplyMinutes: number | null = null;
  if (firstIn) {
    const reply = await db.whatsappMessage.findFirst({ where: { conversationId, organizationId: org, direction: "OUT", automatic: false, createdAt: { gt: firstIn.createdAt } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    if (reply) firstReplyMinutes = Math.max(0, Math.round((reply.createdAt.getTime() - firstIn.createdAt.getTime()) / 60000));
  }

  // Agenda: só do processo vinculado (visível) ou do cliente; nada de processo sigiloso alheio.
  let agenda: PanelData["agenda"] = null;
  if (conv.caseId || conv.clientId) {
    const vis = caseVisibility(ctx);
    const restricted = Object.keys(vis).length > 0; // administrador vê tudo: `case: {}` não filtra nada no Prisma, então a cláusula some
    const seeCase = restricted ? { OR: [{ caseId: null }, { case: vis }] } : {};
    const byCaseOrClient = (caseKey: "caseId", clientKey: "clientId") => ({ OR: [...(conv.caseId ? [{ [caseKey]: conv.caseId }] : []), ...(conv.clientId ? [{ [clientKey]: conv.clientId }] : [])] });
    const [tasks, deadlines, events] = await Promise.all([
      can(ctx, "tasks:read") ? db.task.findMany({ where: { AND: [{ organizationId: org, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } }, byCaseOrClient("caseId", "clientId"), seeCase] }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }], take: 8, select: { id: true, title: true, status: true, priority: true, dueDate: true } }) : [],
      conv.caseId && can(ctx, "deadlines:read") ? db.deadline.findMany({ where: { organizationId: org, caseId: conv.caseId, status: { in: ["DRAFT", "VALIDATED"] }, ...(restricted ? { case: vis } : {}) }, orderBy: { dueDate: "asc" }, take: 8, select: { id: true, title: true, status: true, dueDate: true, caseId: true } }) : [],
      can(ctx, "deadlines:read") ? db.agendaEvent.findMany({ where: { AND: [{ organizationId: org, deletedAt: null, startsAt: { gte: new Date(Date.now() - 12 * 3600_000) } }, byCaseOrClient("caseId", "clientId"), seeCase] }, orderBy: { startsAt: "asc" }, take: 6, select: { id: true, title: true, kind: true, startsAt: true } }) : [],
    ]);
    agenda = {
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due: ymd(t.dueDate), overdue: !!t.dueDate && t.dueDate < todayDate })),
      deadlines: deadlines.map((d) => ({ id: d.id, title: d.title, status: d.status, due: ymd(d.dueDate)!, caseId: d.caseId, overdue: d.dueDate < todayDate })),
      events: events.map((e) => ({ id: e.id, title: e.title, kind: e.kind, startsAt: e.startsAt })),
    };
  }

  let finance: PanelData["finance"] = null;
  if (conv.clientId && can(ctx, "finance:read")) {
    const rows = await db.financeEntry.findMany({ where: { organizationId: org, clientId: conv.clientId, kind: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] }, canceledAt: null }, orderBy: { dueDate: "asc" }, take: 100, select: { id: true, description: true, amount: true, paidAmount: true, dueDate: true, installmentNo: true, installmentTotal: true } });
    let open = 0n;
    let over = 0n;
    let overCount = 0;
    const entries = rows.map((r) => {
      const rest = (toCents(r.amount.toString()) ?? 0n) - (toCents(r.paidAmount.toString()) ?? 0n);
      const overdue = r.dueDate < todayDate;
      open += rest;
      if (overdue) { over += rest; overCount++; }
      return { id: r.id, description: r.description, due: ymd(r.dueDate)!, remaining: fromCents(rest), overdue, installment: r.installmentTotal && r.installmentTotal > 1 ? `${r.installmentNo}/${r.installmentTotal}` : null };
    });
    finance = { openTotal: fromCents(open), overdueTotal: fromCents(over), overdueCount: overCount, entries: entries.slice(0, 8) };
  }

  const KIND: Record<string, string> = { BEFORE: "antes do vencimento", DUE: "no vencimento", OVERDUE: "em atraso" };
  const SEND: Record<string, string> = { SENT: "enviada", FAILED: "falhou", SKIPPED: "não enviada", SENDING: "enviando" };
  const history: HistoryItem[] = [
    ...audits.map((a) => ({ id: `a${a.id}`, at: a.createdAt, kind: "ACTION" as const, text: `${AUDIT_LABEL[a.action]}${a.user ? ` por ${a.user.name}` : ""}` })),
    ...runs.map((r) => ({ id: `r${r.id}`, at: r.createdAt, kind: "AUTOMATION" as const, text: `Automação “${r.automation.name}”${r.status === "DONE" ? " executada" : ` (${r.status.toLowerCase()})`}${r.message ? `: ${r.message}` : ""}` })),
    ...sends.map((s) => ({ id: `s${s.id}`, at: s.createdAt, kind: "BILLING" as const, text: `Cobrança ${KIND[s.kind] ?? ""}${s.offsetDays == null ? " (manual)" : ""}: ${SEND[s.status] ?? s.status}` })),
    ...(bot ? [{ id: "bot", at: bot.startedAt, kind: "BOT" as const, text: `Menu de triagem iniciado${bot.state === "DONE" ? " e concluído" : " (em andamento)"}` }] : []),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 40);

  return {
    stats: { firstContact: conv.createdAt, lastInboundAt: conv.lastInboundAt, incoming: count("IN"), outgoing: count("OUT"), notes: count("NOTE"), firstReplyMinutes },
    client: client ? { ...client, type: client.type, status: client.status } : null,
    lead: lead ? { id: lead.id, name: lead.name, stage: lead.stage, interest: lead.interest, estimatedValue: lead.estimatedValue?.toString() ?? null, nextActionDate: ymd(lead.nextActionDate) } : null,
    otherConversations: others.map((o) => ({ id: o.id, phone: formatWaId(o.waId), status: o.status, lastMessageAt: o.lastMessageAt })),
    caseInfo: caseRow
      ? { id: caseRow.id, number: caseRow.number, title: caseRow.title, status: caseRow.status, area: caseRow.area, court: caseRow.court, phase: caseRow.phase, claimValue: caseRow.claimValue?.toString() ?? null, recent: await db.caseEvent.findMany({ where: { caseId: caseRow.id, organizationId: org }, orderBy: { occurredAt: "desc" }, take: 5, select: { id: true, title: true, kind: true, occurredAt: true } }).then((r) => r.map((e) => ({ id: e.id, title: e.title, kind: e.kind, at: e.occurredAt }))) }
      : null,
    agenda,
    finance,
    history,
  };
}
