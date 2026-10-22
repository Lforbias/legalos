import { db } from "@/lib/db/client";
import { ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

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
  checkRange(range);
  const org = ctx.organizationId;
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
