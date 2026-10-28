import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { assertCan, can, type TenantContext } from "@/server/context";
import { getClient, type ClientListFilters } from "./client.service";
import { caseVisibility } from "./case.service";
import { listActivities } from "./activity.service";
import { documentVisibilityWhere } from "./document.service";

/** A workspace projects existing records. No duplicate client, case, task or document. */
export async function listWorkspaceFolders(ctx: TenantContext, filters: ClientListFilters = {}) {
  assertCan(ctx, "clients:read");
  const q = filters.q?.trim().slice(0, 80);
  const digits = q?.replace(/\D/g, "") ?? "";
  const cv = { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] };
  const where: Prisma.ClientWhereInput = { organizationId: ctx.organizationId, deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" } },
      { tradeName: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ document: { contains: digits } }] : []),
      ...(can(ctx, "cases:read") ? [{ parties: { some: { organizationId: ctx.organizationId, case: { AND: [cv, { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { number: { contains: digits || q } }, { legacyNumber: { contains: q, mode: "insensitive" as const } }] }] } } } }] : []),
    ] } : {}),
  };
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const [total, clients] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, document: true, status: true, type: true, tags: true, parties: { where: { organizationId: ctx.organizationId, case: { AND: [cv, ...(can(ctx, "cases:read") ? [] : [{ id: { in: [] as string[] } }])] } }, take: 3, select: { case: { select: { id: true, title: true, number: true } } }, orderBy: { caseId: "asc" as const } } } }),
  ]);
  return { total, page, pageSize: 20, pages: Math.max(1, Math.ceil(total / 20)), items: clients.map(c => ({ id: c.id, name: c.name, document: c.document, status: c.status, type: c.type, tags: c.tags, cases: can(ctx, "cases:read") ? [...new Map(c.parties.map(p => [p.case.id, p.case])).values()] : [] })) };
}

export async function getClientWorkspace(ctx: TenantContext, clientId: string) {
  const client = await getClient(ctx, clientId);
  const org = ctx.organizationId;
  const cv = { AND: [{ organizationId: org, deletedAt: null }, caseVisibility(ctx)] };
  const relatedCase = { AND: [cv, { parties: { some: { organizationId: org, clientId } } }] };
  const relation = { OR: [{ clientId }, { case: relatedCase }] };
  const visibleLink = { OR: [{ caseId: null }, { case: cv }] };
  const casesWhere = relatedCase;
  const documentAccess = documentVisibilityWhere(ctx);
  const docsWhere = { AND: [{ organizationId: org, deletedAt: null }, relation, visibleLink, documentAccess ?? { id: { in: [] as string[] } }] };
  const noticesWhere = { organizationId: org, deletedAt: null, case: relatedCase };
  const chatsWhere = { AND: [{ organizationId: org }, relation, visibleLink] };
  // Financial entries store raw IDs, not Prisma client/case relations.
  const directFinance = can(ctx, "finance:read") ? await db.financeEntry.findMany({ where: { organizationId: org, clientId, caseId: { not: null } }, distinct: ["caseId"], select: { caseId: true } }) : [];
  const financeCases = can(ctx, "finance:read") ? await db.case.findMany({ where: { AND: [cv, { OR: [{ parties: { some: { organizationId: org, clientId } } }, { id: { in: directFinance.map(f => f.caseId!).filter(Boolean) } }] }] }, select: { id: true, parties: { where: { organizationId: org, clientId }, select: { id: true } } } }) : [];
  const financeWhere: Prisma.FinanceEntryWhereInput = { AND: [
    { organizationId: org, canceledAt: null, kind: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] } },
    { OR: [{ clientId }, { caseId: { in: financeCases.filter(c => c.parties.length > 0).map(c => c.id) } }] },
    { OR: [{ caseId: null }, { caseId: { in: financeCases.map(c => c.id) } }] },
  ] };
  const [cases, caseCount, work, documents, documentCount, notices, noticeCount, chats, chatCount, finance, financeTotals, movements] = await Promise.all([
    can(ctx, "cases:read") ? db.case.findMany({ where: casesWhere, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 40, select: { id: true, title: true, number: true, nature: true, department: { select: { name: true } }, status: true, area: true, phase: true, updatedAt: true } }) : null,
    can(ctx, "cases:read") ? db.case.count({ where: casesWhere }) : null,
    can(ctx, "tasks:read") || can(ctx, "deadlines:read") ? listActivities(ctx, { clientId }) : null,
    can(ctx, "documents:read") ? db.document.findMany({ where: docsWhere, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 40, select: { id: true, name: true, category: true, caseId: true, updatedAt: true, currentVersion: true } }) : null,
    can(ctx, "documents:read") ? db.document.count({ where: docsWhere }) : null,
    can(ctx, "inbox:read") ? db.courtNotice.findMany({ where: noticesWhere, orderBy: [{ receivedAt: "desc" }, { id: "asc" }], take: 40, select: { id: true, title: true, status: true, caseId: true, receivedAt: true } }) : null,
    can(ctx, "inbox:read") ? db.courtNotice.count({ where: noticesWhere }) : null,
    can(ctx, "whatsapp:read") ? db.whatsappConversation.findMany({ where: chatsWhere, orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "asc" }], take: 40, select: { id: true, contactName: true, status: true, unreadCount: true, lastMessageAt: true, caseId: true, account: { select: { label: true } } } }) : null,
    can(ctx, "whatsapp:read") ? db.whatsappConversation.count({ where: chatsWhere }) : null,
    can(ctx, "finance:read") ? db.financeEntry.findMany({ where: financeWhere, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 40, select: { id: true, description: true, amount: true, paidAmount: true, dueDate: true, caseId: true } }) : null,
    can(ctx, "finance:read") ? db.financeEntry.aggregate({ where: financeWhere, _sum: { amount: true, paidAmount: true }, _count: true }) : null,
    can(ctx, "cases:read") ? db.caseEvent.findMany({ where: { organizationId: org, case: relatedCase }, orderBy: [{ occurredAt: "desc" }, { id: "asc" }], take: 30, select: { id: true, title: true, occurredAt: true, caseId: true, case: { select: { title: true } } } }) : null,
  ]);
  const recent = [
    ...(movements ?? []).map(m => ({ key: `movement-${m.id}`, title: m.title, source: m.case.title, at: m.occurredAt, href: `/processos/${m.caseId}?aba=andamentos` })),
    ...(documents ?? []).map(d => ({ key: `document-${d.id}`, title: d.name, source: "Documento atualizado", at: d.updatedAt, href: `/documentos/${d.id}` })),
    ...(notices ?? []).map(n => ({ key: `notice-${n.id}`, title: n.title, source: "Intimação recebida", at: n.receivedAt, href: `/caixa-de-entrada/${n.id}` })),
    ...(chats ?? []).filter(c => c.lastMessageAt).map(c => ({ key: `chat-${c.id}`, title: c.contactName ?? client.name, source: "Última atividade na conversa", at: c.lastMessageAt!, href: `/atendimento?c=${c.id}` })),
  ].sort((a,b) => b.at.getTime() - a.at.getTime()).slice(0, 30);
  return { client, cases, caseCount, work, documents, documentCount, notices, noticeCount, chats, chatCount, finance, financeTotals, recent };
}
