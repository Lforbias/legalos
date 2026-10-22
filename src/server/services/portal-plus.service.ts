import { db } from "@/lib/db/client";
import { suggestPlain } from "@/lib/portal/plain-language";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, logCaseEvent } from "./case.service";
import { notify } from "./notification.service";

/** 5.0-F2 — andamento em linguagem simples, pendências do cliente e mensagens do portal. */

const clean = (s: unknown, max: number) => String(s ?? "").replace(/\u0000/g, "").trim().slice(0, max);

// ---------------- equipe: andamentos em linguagem simples ----------------
export async function draftPortalUpdate(ctx: TenantContext, caseId: string, input: { originalText: string; plainText?: string; sourceEventId?: string | null }) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const original = clean(input.originalText, 4000);
  if (!original) throw new ValidationError("Informe o texto do andamento.", { originalText: ["Informe o texto do andamento."] });
  let plain = clean(input.plainText, 2000);
  if (!plain) {
    const s = suggestPlain(original);
    if (!s) throw new ValidationError("Não há modelo para esse tipo de andamento. Escreva o texto em linguagem simples.", { plainText: ["Escreva o texto em linguagem simples."] });
    plain = s.text;
  }
  const row = await db.portalUpdate.create({ data: { organizationId: ctx.organizationId, caseId, sourceEventId: input.sourceEventId ?? null, originalText: original, plainText: plain, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "portal.update_draft", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_update", resourceId: row.id, meta: ctx.meta });
  return row;
}

export async function approvePortalUpdate(ctx: TenantContext, id: string, editedText?: string) {
  assertCan(ctx, "cases:write");
  const u = await db.portalUpdate.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!u) throw new NotFoundError("Andamento não encontrado.");
  await assertCaseVisible(ctx, u.caseId);
  if (u.status !== "DRAFT") throw new ConflictError("Este texto já foi tratado.");
  const text = clean(editedText, 2000) || u.plainText;
  await db.$transaction(async (tx) => {
    await tx.portalUpdate.update({ where: { id }, data: { status: "APPROVED", plainText: text, approvedById: ctx.userId, approvedAt: new Date() } });
    await logCaseEvent(tx, ctx, u.caseId, { kind: "PORTAL_UPDATE", title: "Andamento aprovado para o portal do cliente" });
    await audit({ action: "portal.update_approve", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_update", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function discardPortalUpdate(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:write");
  const u = await db.portalUpdate.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { caseId: true, status: true } });
  if (!u) throw new NotFoundError("Andamento não encontrado.");
  await assertCaseVisible(ctx, u.caseId);
  await db.portalUpdate.update({ where: { id }, data: { status: "DISCARDED" } });
  await audit({ action: "portal.update_discard", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_update", resourceId: id, meta: ctx.meta });
}

export async function listPortalUpdatesForCase(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  return db.portalUpdate.findMany({ where: { organizationId: ctx.organizationId, caseId, status: { not: "DISCARDED" } }, orderBy: { createdAt: "desc" }, take: 50 });
}

// ---------------- equipe: pendências do cliente ----------------
export async function createClientPending(ctx: TenantContext, input: { clientId: string; caseId?: string | null; title: string; description?: string; dueDate?: string | null }) {
  assertCan(ctx, "clients:write");
  const title = clean(input.title, 160);
  if (!title) throw new ValidationError("Informe o que o cliente precisa fazer.", { title: ["Informe o que o cliente precisa fazer."] });
  const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  if (input.caseId) await assertCaseVisible(ctx, input.caseId);
  const row = await db.clientPending.create({
    data: { organizationId: ctx.organizationId, clientId: client.id, caseId: input.caseId ?? null, title, description: clean(input.description, 1000) || null, dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null, createdById: ctx.userId },
    select: { id: true },
  });
  await audit({ action: "portal.pending_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client_pending", resourceId: row.id, meta: ctx.meta });
  return row;
}

export async function listPendingsForClient(ctx: TenantContext, clientId: string) {
  assertCan(ctx, "clients:read");
  return db.clientPending.findMany({ where: { organizationId: ctx.organizationId, clientId, status: { not: "CANCELED" } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
}

export async function setPendingStatus(ctx: TenantContext, id: string, status: "DONE" | "CANCELED" | "OPEN") {
  assertCan(ctx, "clients:write");
  const r = await db.clientPending.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { status, doneAt: status === "DONE" ? new Date() : null } });
  if (r.count === 0) throw new NotFoundError("Pendência não encontrada.");
  await audit({ action: "portal.pending_status", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client_pending", resourceId: id, metadata: { status }, meta: ctx.meta });
}

// ---------------- equipe: mensagens ----------------
export async function listPortalInbox(ctx: TenantContext) {
  assertCan(ctx, "clients:read");
  const rows = await db.portalMessage.groupBy({ by: ["clientId"], where: { organizationId: ctx.organizationId }, _max: { createdAt: true }, _count: { _all: true }, orderBy: { _max: { createdAt: "desc" } }, take: 100 });
  const unread = await db.portalMessage.groupBy({ by: ["clientId"], where: { organizationId: ctx.organizationId, fromClient: true, readAt: null }, _count: { _all: true } });
  const clients = await db.client.findMany({ where: { id: { in: rows.map((r) => r.clientId) }, organizationId: ctx.organizationId }, select: { id: true, name: true } });
  const names = new Map(clients.map((c) => [c.id, c.name]));
  return rows.map((r) => ({ clientId: r.clientId, name: names.get(r.clientId) ?? "Cliente", last: r._max.createdAt!, total: r._count._all, unread: unread.find((u) => u.clientId === r.clientId)?._count._all ?? 0 }));
}

export async function listMessagesForClient(ctx: TenantContext, clientId: string) {
  assertCan(ctx, "clients:read");
  const msgs = await db.portalMessage.findMany({ where: { organizationId: ctx.organizationId, clientId }, orderBy: { createdAt: "asc" }, take: 300 });
  await db.portalMessage.updateMany({ where: { organizationId: ctx.organizationId, clientId, fromClient: true, readAt: null }, data: { readAt: new Date() } });
  return msgs;
}

export async function replyToClient(ctx: TenantContext, clientId: string, body: string) {
  assertCan(ctx, "clients:write");
  const text = clean(body, 3000);
  if (!text) throw new ValidationError("Escreva a mensagem.", { body: ["Escreva a mensagem."] });
  const client = await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  const row = await db.portalMessage.create({ data: { organizationId: ctx.organizationId, clientId, fromClient: false, authorId: ctx.userId, body: text }, select: { id: true } });
  await audit({ action: "portal.message_reply", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_message", resourceId: row.id, meta: ctx.meta });
  return row;
}

// ---------------- cliente (portal) ----------------
async function myClientIds(ctx: TenantContext): Promise<string[]> {
  if (!ctx.permissions.has("portal:access")) throw new ForbiddenError();
  const rows = await db.portalAccount.findMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId, revokedAt: null }, select: { clientId: true } });
  return rows.map((r) => r.clientId);
}

/** Andamentos APROVADOS do processo (só o texto simples; nunca o original) — o processo precisa estar compartilhado com o cliente. */
export async function approvedUpdatesForPortalCase(ctx: TenantContext, caseId: string) {
  const ids = await myClientIds(ctx);
  if (!ids.length) return [];
  const ok = await db.case.findFirst({ where: { id: caseId, organizationId: ctx.organizationId, deletedAt: null, sharedWithPortal: true, parties: { some: { clientId: { in: ids } } } }, select: { id: true } });
  if (!ok) return [];
  return db.portalUpdate.findMany({ where: { organizationId: ctx.organizationId, caseId, status: "APPROVED" }, orderBy: { approvedAt: "desc" }, take: 20, select: { id: true, plainText: true, approvedAt: true } });
}

export async function listMyPendings(ctx: TenantContext) {
  const ids = await myClientIds(ctx);
  if (!ids.length) return [];
  return db.clientPending.findMany({ where: { organizationId: ctx.organizationId, clientId: { in: ids }, status: { in: ["OPEN", "CLIENT_DONE"] } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, title: true, description: true, dueDate: true, status: true } });
}

export async function markMyPendingDone(ctx: TenantContext, id: string, note?: string) {
  const ids = await myClientIds(ctx);
  const p = ids.length ? await db.clientPending.findFirst({ where: { id, organizationId: ctx.organizationId, clientId: { in: ids }, status: "OPEN" }, select: { id: true, title: true, caseId: true, clientId: true, createdById: true } }) : null;
  if (!p) throw new NotFoundError("Pendência não encontrada.");
  await db.clientPending.update({ where: { id }, data: { status: "CLIENT_DONE", clientNote: clean(note, 500) || null, doneAt: new Date() } });
  await audit({ action: "portal.pending_client_done", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client_pending", resourceId: id, meta: ctx.meta });
  if (p.createdById) await notify({ organizationId: ctx.organizationId, userId: p.createdById, kind: "portal", title: `O cliente marcou como feita: ${p.title}`, link: `/clientes/${p.clientId}`, dedupeKey: `pending:${id}` });
}

export async function listMyMessages(ctx: TenantContext) {
  const ids = await myClientIds(ctx);
  if (!ids.length) return [];
  return db.portalMessage.findMany({ where: { organizationId: ctx.organizationId, clientId: { in: ids } }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, body: true, fromClient: true, createdAt: true } });
}

export async function sendMyMessage(ctx: TenantContext, body: string) {
  const ids = await myClientIds(ctx);
  if (!ids.length) throw new ForbiddenError();
  const text = clean(body, 2000);
  if (!text) throw new ValidationError("Escreva a mensagem.", { body: ["Escreva a mensagem."] });
  const recent = await db.portalMessage.count({ where: { organizationId: ctx.organizationId, clientId: ids[0]!, fromClient: true, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= 20) throw new ConflictError("Você enviou muitas mensagens em pouco tempo. Aguarde um pouco ou ligue para o escritório.");
  const row = await db.portalMessage.create({ data: { organizationId: ctx.organizationId, clientId: ids[0]!, fromClient: true, authorId: ctx.userId, body: text }, select: { id: true } });
  // avisa quem é responsável pelos processos do cliente (ou, sem processo, quem administra o escritório)
  const members = await db.caseMember.findMany({ where: { organizationId: ctx.organizationId, role: "RESPONSIBLE", case: { deletedAt: null, status: "ACTIVE", parties: { some: { clientId: ids[0]! } } } }, select: { userId: true }, take: 10 });
  const targets = [...new Set(members.map((m) => m.userId))];
  if (targets.length === 0) {
    const admins = await db.membership.findMany({ where: { organizationId: ctx.organizationId, role: { key: { in: ["OWNER", "ADMIN"] } } }, select: { userId: true }, take: 5 });
    admins.forEach((a) => targets.push(a.userId));
  }
  await notify(targets.map((userId) => ({ organizationId: ctx.organizationId, userId, kind: "portal", title: "Nova mensagem de cliente pelo portal", link: `/portal-equipe/${ids[0]}`, dedupeKey: `portalmsg:${row.id}:${userId}` })));
  return row;
}
