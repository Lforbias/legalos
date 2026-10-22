import { db } from "@/lib/db/client";
import { ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { enqueueMail } from "./mail-outbox.service";
import { logger } from "@/lib/logging/logger";

/**
 * Relatórios e exportação do LegalOS Chat. Tudo calculado das mensagens reais (nada estimado).
 * Relatório e exportação em massa exigem `whatsapp:manage`; exportar UMA conversa exige `whatsapp:read` e fica no registro de auditoria.
 */

export type ChatReportRange = { from: Date; to: Date };
export const MAX_EXPORT_MESSAGES = 50_000;

function checkRange(r: ChatReportRange) {
  if (!(r.from < r.to)) throw new ValidationError("O período final precisa ser depois do inicial.", { to: ["Período inválido."] });
  if (r.to.getTime() - r.from.getTime() > 366 * 86_400_000) throw new ValidationError("Escolha um período de até 1 ano.", { to: ["Período muito longo."] });
}

type Row = { conversation_id: string; account_id: string; assigned_to_id: string | null; direction: string; automatic: boolean; created_at: Date };

export type ChatReport = {
  totals: { conversations: number; open: number; closed: number; messagesIn: number; messagesOut: number; unanswered: number };
  firstResponse: { count: number; avgMinutes: number | null; medianMinutes: number | null };
  byNumber: { accountId: string; label: string; conversations: number; messagesIn: number; messagesOut: number }[];
  byAgent: { userId: string | null; name: string; conversations: number; messagesOut: number }[];
  byDay: { day: string; in: number; out: number }[];
};

/** Tempo até a primeira resposta HUMANA (mensagem de saída não automática) depois da primeira mensagem do cliente no período. */
export async function chatReport(ctx: TenantContext, range: ChatReportRange): Promise<ChatReport> {
  assertCan(ctx, "whatsapp:manage");
  return computeChatReport(ctx.organizationId, range);
}

export async function computeChatReport(org: string, range: ChatReportRange): Promise<ChatReport> {
  checkRange(range);
  const [msgs, convs, accounts] = await Promise.all([
    db.whatsappMessage.findMany({ where: { organizationId: org, createdAt: { gte: range.from, lt: range.to } }, orderBy: { createdAt: "asc" }, select: { conversationId: true, direction: true, automatic: true, createdAt: true, conversation: { select: { accountId: true, assignedToId: true } } } }),
    db.whatsappConversation.findMany({ where: { organizationId: org, OR: [{ lastMessageAt: { gte: range.from, lt: range.to } }, { createdAt: { gte: range.from, lt: range.to } }] }, select: { id: true, accountId: true, status: true, assignedToId: true, lastInboundAt: true } }),
    db.whatsappAccount.findMany({ where: { organizationId: org }, select: { id: true, label: true } }),
  ]);
  const rows: Row[] = msgs.map((m) => ({ conversation_id: m.conversationId, account_id: m.conversation.accountId, assigned_to_id: m.conversation.assignedToId, direction: m.direction, automatic: m.automatic, created_at: m.createdAt }));

  const firstIn = new Map<string, Date>();
  const answered = new Set<string>();
  const waits: number[] = [];
  for (const r of rows) {
    if (r.direction === "IN" && !firstIn.has(r.conversation_id)) firstIn.set(r.conversation_id, r.created_at);
    else if (r.direction === "OUT" && !r.automatic && firstIn.has(r.conversation_id) && !answered.has(r.conversation_id)) {
      answered.add(r.conversation_id);
      waits.push((r.created_at.getTime() - firstIn.get(r.conversation_id)!.getTime()) / 60_000);
    }
  }
  waits.sort((a, b) => a - b);
  const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
  const med = waits.length ? (waits.length % 2 ? waits[(waits.length - 1) / 2]! : (waits[waits.length / 2 - 1]! + waits[waits.length / 2]!) / 2) : null;
  const unanswered = [...firstIn.keys()].filter((id) => !answered.has(id)).length;

  const label = new Map(accounts.map((a) => [a.id, a.label]));
  const num = new Map<string, { conv: Set<string>; in: number; out: number }>();
  const agent = new Map<string | null, { conv: Set<string>; out: number }>();
  const day = new Map<string, { in: number; out: number }>();
  for (const r of rows) {
    const n = num.get(r.account_id) ?? { conv: new Set<string>(), in: 0, out: 0 };
    n.conv.add(r.conversation_id);
    if (r.direction === "IN") n.in++; else n.out++;
    num.set(r.account_id, n);
    const a = agent.get(r.assigned_to_id) ?? { conv: new Set<string>(), out: 0 };
    a.conv.add(r.conversation_id);
    if (r.direction === "OUT" && !r.automatic) a.out++;
    agent.set(r.assigned_to_id, a);
    const k = r.created_at.toISOString().slice(0, 10);
    const d = day.get(k) ?? { in: 0, out: 0 };
    if (r.direction === "IN") d.in++; else d.out++;
    day.set(k, d);
  }
  const userIds = [...agent.keys()].filter((x): x is string => !!x);
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const uname = new Map(users.map((u) => [u.id, u.name]));

  return {
    totals: { conversations: convs.length, open: convs.filter((c) => c.status !== "CLOSED").length, closed: convs.filter((c) => c.status === "CLOSED").length, messagesIn: rows.filter((r) => r.direction === "IN").length, messagesOut: rows.filter((r) => r.direction === "OUT").length, unanswered },
    firstResponse: { count: waits.length, avgMinutes: avg === null ? null : Math.round(avg * 10) / 10, medianMinutes: med == null ? null : Math.round(med * 10) / 10 },
    byNumber: [...num].map(([id, v]) => ({ accountId: id, label: label.get(id) ?? "Número", conversations: v.conv.size, messagesIn: v.in, messagesOut: v.out })).sort((a, b) => b.conversations - a.conversations),
    byAgent: [...agent].map(([id, v]) => ({ userId: id, name: id ? uname.get(id) ?? "Usuário" : "Sem responsável", conversations: v.conv.size, messagesOut: v.out })).sort((a, b) => b.messagesOut - a.messagesOut),
    byDay: [...day].map(([d, v]) => ({ day: d, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita fórmula em planilha
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = ["data_hora", "numero", "conversa", "contato", "direcao", "automatica", "tipo", "texto"];

type ExportMsg = { createdAt: Date; direction: string; automatic: boolean; type: string; body: string | null; conversation: { id: string; waId: string; contactName: string | null; account: { label: string } } };
function toCsv(rows: ExportMsg[]): string {
  const lines = [HEADER.join(";")];
  for (const m of rows) lines.push([m.createdAt, m.conversation.account.label, m.conversation.id, m.conversation.contactName ?? m.conversation.waId, m.direction === "IN" ? "cliente" : "equipe", m.automatic ? "sim" : "não", m.type, m.body ?? ""].map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
const SEL = { createdAt: true, direction: true, automatic: true, type: true, body: true, conversation: { select: { id: true, waId: true, contactName: true, account: { select: { label: true } } } } } as const;

/** Uma conversa (quem pode ler o Chat). Registra auditoria. */
export async function exportConversationCsv(ctx: TenantContext, conversationId: string): Promise<{ filename: string; csv: string; count: number }> {
  assertCan(ctx, "whatsapp:read");
  const conv = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!conv) throw new ValidationError("Conversa não encontrada.");
  const rows = await db.whatsappMessage.findMany({ where: { organizationId: ctx.organizationId, conversationId }, orderBy: { createdAt: "asc" }, select: SEL, take: MAX_EXPORT_MESSAGES });
  await audit({ action: "whatsapp.export_conversation", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_conversation", resourceId: conversationId, metadata: { messages: rows.length }, meta: ctx.meta });
  return { filename: `conversa-${conversationId.slice(0, 8)}.csv`, csv: toCsv(rows), count: rows.length };
}

/** Todas as conversas do período (somente gestão). Limite de 50 mil mensagens; acima disso, pede para reduzir o período. */
export async function exportAllCsv(ctx: TenantContext, range: ChatReportRange, accountId?: string | null): Promise<{ filename: string; csv: string; count: number }> {
  assertCan(ctx, "whatsapp:manage");
  checkRange(range);
  const where = { organizationId: ctx.organizationId, createdAt: { gte: range.from, lt: range.to }, ...(accountId ? { conversation: { accountId } } : {}) };
  const total = await db.whatsappMessage.count({ where });
  if (total > MAX_EXPORT_MESSAGES) throw new ValidationError(`Este período tem ${total} mensagens (limite de ${MAX_EXPORT_MESSAGES}). Escolha um período menor.`, { to: ["Período grande demais."] });
  const rows = await db.whatsappMessage.findMany({ where, orderBy: { createdAt: "asc" }, select: SEL });
  await audit({ action: "whatsapp.export_all", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_export", metadata: { messages: rows.length, from: range.from.toISOString(), to: range.to.toISOString(), accountId: accountId ?? null }, meta: ctx.meta });
  return { filename: `chat-${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`, csv: toCsv(rows), count: rows.length };
}


// ======================= 4.0-F6: relatórios novos =======================

export type ChatReportExtra = {
  byStatus: { statusId: string | null; name: string; conversations: number; messages: number }[];
  added: { day: string; count: number }[];
  addedByNumber: { accountId: string; label: string; count: number }[];
  responseByUser: { userId: string; name: string; replies: number; avgFirstResponseMinutes: number | null }[];
  logins: { userId: string; name: string; logins: number; lastLoginAt: Date | null }[];
};

/** Mensagens por status do chat, chats adicionados por dia/número, tempo de 1ª resposta por usuário e acessos (logins) da equipe. */
export async function chatReportExtra(ctx: TenantContext, range: ChatReportRange): Promise<ChatReportExtra> {
  assertCan(ctx, "whatsapp:manage");
  checkRange(range);
  const org = ctx.organizationId;
  const [statuses, convs, msgs, accounts, members] = await Promise.all([
    db.whatsappChatStatus.findMany({ where: { organizationId: org }, select: { id: true, name: true } }),
    db.whatsappConversation.findMany({ where: { organizationId: org, OR: [{ createdAt: { gte: range.from, lt: range.to } }, { lastMessageAt: { gte: range.from, lt: range.to } }] }, select: { id: true, createdAt: true, accountId: true, chatStatusId: true } }),
    db.whatsappMessage.findMany({ where: { organizationId: org, createdAt: { gte: range.from, lt: range.to }, direction: { in: ["IN", "OUT"] } }, orderBy: { createdAt: "asc" }, select: { conversationId: true, direction: true, automatic: true, authorId: true, createdAt: true } }),
    db.whatsappAccount.findMany({ where: { organizationId: org }, select: { id: true, label: true } }),
    db.membership.findMany({ where: { organizationId: org, status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
  ]);
  const sname = new Map(statuses.map((s) => [s.id, s.name]));
  const convStatus = new Map(convs.map((c) => [c.id, c.chatStatusId]));
  const by = new Map<string | null, { c: number; m: number }>();
  for (const c of convs) { const v = by.get(c.chatStatusId) ?? { c: 0, m: 0 }; v.c++; by.set(c.chatStatusId, v); }
  for (const m of msgs) { const k = convStatus.get(m.conversationId) ?? null; const v = by.get(k) ?? { c: 0, m: 0 }; v.m++; by.set(k, v); }
  const created = convs.filter((c) => c.createdAt >= range.from && c.createdAt < range.to);
  const day = new Map<string, number>();
  const num = new Map<string, number>();
  for (const c of created) { const k = c.createdAt.toISOString().slice(0, 10); day.set(k, (day.get(k) ?? 0) + 1); num.set(c.accountId, (num.get(c.accountId) ?? 0) + 1); }
  const label = new Map(accounts.map((a) => [a.id, a.label]));
  const uname = new Map(members.map((m) => [m.userId, m.user.name]));
  const firstIn = new Map<string, Date>(), answered = new Set<string>();
  const resp = new Map<string, { n: number; waits: number[] }>();
  for (const m of msgs) {
    if (m.direction === "IN" && !firstIn.has(m.conversationId)) firstIn.set(m.conversationId, m.createdAt);
    else if (m.direction === "OUT" && !m.automatic && m.authorId) {
      const r = resp.get(m.authorId) ?? { n: 0, waits: [] };
      r.n++;
      if (firstIn.has(m.conversationId) && !answered.has(m.conversationId)) { answered.add(m.conversationId); r.waits.push((m.createdAt.getTime() - firstIn.get(m.conversationId)!.getTime()) / 60_000); }
      resp.set(m.authorId, r);
    }
  }
  const logins = await db.auditLog.groupBy({ by: ["userId"], where: { action: "auth.login", result: "SUCCESS", createdAt: { gte: range.from, lt: range.to }, userId: { in: members.map((m) => m.userId) } }, _count: true, _max: { createdAt: true } });
  return {
    byStatus: [...by].map(([id, v]) => ({ statusId: id, name: id ? sname.get(id) ?? "Status" : "Sem status", conversations: v.c, messages: v.m })).sort((a, b) => b.messages - a.messages),
    added: [...day].map(([d, count]) => ({ day: d, count })).sort((a, b) => a.day.localeCompare(b.day)),
    addedByNumber: [...num].map(([id, count]) => ({ accountId: id, label: label.get(id) ?? "Número", count })).sort((a, b) => b.count - a.count),
    responseByUser: [...resp].map(([id, v]) => ({ userId: id, name: uname.get(id) ?? "Usuário", replies: v.n, avgFirstResponseMinutes: v.waits.length ? Math.round((v.waits.reduce((a, b) => a + b, 0) / v.waits.length) * 10) / 10 : null })).sort((a, b) => b.replies - a.replies),
    logins: logins.filter((l) => l.userId).map((l) => ({ userId: l.userId!, name: uname.get(l.userId!) ?? "Usuário", logins: l._count, lastLoginAt: l._max.createdAt })).sort((a, b) => b.logins - a.logins),
  };
}

// ======================= exportação agendada por e-mail =======================

export const FREQUENCY_LABEL: Record<string, string> = { DAILY: "Todo dia", WEEKLY: "Toda segunda-feira", MONTHLY: "Todo dia 1º do mês" };
const EMAIL_RE = /^[^<>@\s,;]+@[^<>@\s,;]+\.[^<>@\s,;]+$/;

export async function getReportSchedule(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:manage");
  const s = await db.whatsappReportSchedule.findUnique({ where: { organizationId: ctx.organizationId } });
  return { enabled: s?.enabled ?? false, frequency: s?.frequency ?? "WEEKLY", recipients: s?.recipients ?? [], lastSentAt: s?.lastSentAt ?? null };
}

export async function saveReportSchedule(ctx: TenantContext, input: { enabled: boolean; frequency: string; recipients: string[] }) {
  assertCan(ctx, "whatsapp:manage");
  if (!(input.frequency in FREQUENCY_LABEL)) throw new ValidationError("Frequência inválida.", { frequency: ["Frequência inválida."] });
  const rec = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  if (rec.length > 10) throw new ValidationError("No máximo 10 e-mails.", { recipients: ["Máximo 10."] });
  for (const r of rec) if (!EMAIL_RE.test(r)) throw new ValidationError(`“${r}” não parece um e-mail válido.`, { recipients: [`E-mail inválido: ${r}`] });
  if (input.enabled && rec.length === 0) throw new ValidationError("Informe ao menos um e-mail.", { recipients: ["Informe ao menos um e-mail."] });
  const data = { enabled: input.enabled, frequency: input.frequency, recipients: rec };
  await db.whatsappReportSchedule.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  await audit({ action: "whatsapp.report_schedule", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_report", metadata: { ...data, recipients: rec.length }, meta: ctx.meta });
}

function reportText(orgName: string, label: string, r: ChatReport): string {
  const fr = r.firstResponse.avgMinutes === null ? "sem dados" : `${r.firstResponse.avgMinutes} min (média)`;
  return [
    `Resumo do atendimento — ${orgName}`, label, "",
    `Conversas: ${r.totals.conversations} (${r.totals.open} abertas, ${r.totals.closed} encerradas)`,
    `Mensagens: ${r.totals.messagesIn} recebidas, ${r.totals.messagesOut} enviadas`,
    `Sem resposta humana: ${r.totals.unanswered}`,
    `Tempo até a 1ª resposta: ${fr}`, "",
    "Por atendente:", ...r.byAgent.slice(0, 10).map((a) => `- ${a.name}: ${a.conversations} conversas, ${a.messagesOut} mensagens`), "",
    "Este e-mail traz só números do período (sem nomes de clientes nem conteúdo de conversas). Para o detalhe, abra Atendimento > Relatórios no LegalOS.",
  ].join("\n");
}

/** Rotina: envia o resumo do período anterior. Diário (após 7h), segunda-feira (semana anterior) ou dia 1º (mês anterior). Uma vez por período e e-mail. */
export async function runReportSchedules(now = new Date()): Promise<{ orgs: number; queued: number }> {
  const res = { orgs: 0, queued: 0 };
  const all = await db.whatsappReportSchedule.findMany({ where: { enabled: true } });
  for (const s of all) {
    try {
      const org = await db.organization.findFirst({ where: { id: s.organizationId, deletedAt: null }, select: { name: true, timezone: true } });
      if (!org) continue;
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: org.timezone, hour: "2-digit", hour12: false }).format(now)) % 24;
      if (hour < 7) continue;
      const { todayYmd, addDays, weekday, ymdToDate } = await import("@/lib/dates/ymd");
      const today = todayYmd(org.timezone, now);
      let fromY: string, label: string;
      if (s.frequency === "DAILY") { fromY = addDays(today, -1); label = `Dia ${fromY.split("-").reverse().join("/")}`; }
      else if (s.frequency === "WEEKLY") { if (weekday(today) !== 1) continue; fromY = addDays(today, -7); label = `Semana de ${fromY.split("-").reverse().join("/")} a ${addDays(today, -1).split("-").reverse().join("/")}`; }
      else { if (!today.endsWith("-01")) continue; const [y, m] = today.split("-").map(Number) as [number, number]; fromY = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`; label = `Mês ${fromY.slice(5, 7)}/${fromY.slice(0, 4)}`; }
      // limites em UTC a partir da data local (diferença de fuso de poucas horas é aceitável para um resumo)
      const range = { from: ymdToDate(fromY), to: ymdToDate(today) };
      const report = await computeChatReport(s.organizationId, range);
      const text = reportText(org.name, label, report);
      let any = false;
      for (const to of s.recipients) {
        const q = await enqueueMail({ organizationId: s.organizationId, kind: "chat.report", to, subject: `Resumo do atendimento — ${label}`, text, dedupeKey: `chat.report:${s.organizationId}:${fromY}:${s.frequency}:${to}` });
        if (q.queued) { res.queued++; any = true; }
      }
      if (any) await db.whatsappReportSchedule.update({ where: { organizationId: s.organizationId }, data: { lastSentAt: now } });
      res.orgs++;
    } catch (e) {
      logger.error("whatsapp.report_schedule_failed", { organizationId: s.organizationId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return res;
}
