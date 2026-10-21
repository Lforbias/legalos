import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { sendMailSafe } from "@/lib/mail/mailer";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { normalizeEmail } from "@/lib/validation/email";
import { product } from "@/config/product";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { appUrl } from "./auth.service";
import { assertCaseVisible, logCaseEvent } from "./case.service";
import { isUniqueViolation } from "./db-errors";
import { invitationLink } from "./invitation.service";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
void appUrl;

// ======================= lado do escritório =======================

/** Convida uma pessoa a acessar o portal como um cliente específico. O convite é amarrado ao cliente (client_id). */
export async function inviteClientToPortal(ctx: TenantContext, clientId: string, rawEmail: string) {
  assertCan(ctx, "clients:write");
  assertCan(ctx, "members:invite");
  const email = normalizeEmail(rawEmail);
  if (!email) throw new ValidationError("E-mail inválido.", { email: ["E-mail inválido."] });
  const client = await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  const role = await db.role.findFirst({ where: { organizationId: ctx.organizationId, key: "CLIENT" } });
  if (!role) throw new NotFoundError("Perfil de cliente não encontrado neste escritório.");

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const m = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: existingUser.id } }, select: { role: { select: { key: true } } } });
    if (m && m.role.key !== "CLIENT") throw new ConflictError("Este e-mail pertence a um membro da equipe e não pode ser usado no portal.");
  }
  const token = generateToken();
  try {
    await db.invitation.updateMany({ where: { organizationId: ctx.organizationId, email, acceptedAt: null, revokedAt: null, expiresAt: { lte: new Date() } }, data: { revokedAt: new Date() } });
    const inv = await db.invitation.create({
      data: { organizationId: ctx.organizationId, email, roleId: role.id, clientId: client.id, tokenHash: hashToken(token), invitedById: ctx.userId, expiresAt: new Date(Date.now() + TTL_MS) },
    });
    const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } });
    const sent = await sendMailSafe({
      to: email,
      subject: `Acesso ao portal do cliente — ${org.name}`,
      text: `${org.name} convidou você para acompanhar seus processos e documentos compartilhados no ${product.name}. Aceite em: ${invitationLink(token)}`,
    });
    await audit({ action: "portal.invite", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client", resourceId: client.id, metadata: { invitationId: inv.id }, meta: ctx.meta });
    // O token em claro só existe agora; devolvido uma única vez para exibir o link quando não há envio real de e-mail.
    return { link: invitationLink(token), emailDelivered: sent.delivered };
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe um convite pendente para este e-mail. Revogue-o ou aguarde expirar.");
    throw err;
  }
}

export async function listPortalAccess(ctx: TenantContext, clientId: string) {
  assertCan(ctx, "clients:read");
  const client = await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  const [accounts, invitations] = await Promise.all([
    db.portalAccount.findMany({ where: { organizationId: ctx.organizationId, clientId, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    db.invitation.findMany({ where: { organizationId: ctx.organizationId, clientId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, expiresAt: true } }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: accounts.map((a) => a.userId) } }, select: { id: true, name: true, email: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return { accounts: accounts.map((a) => ({ id: a.id, name: byId.get(a.userId)?.name ?? "—", email: byId.get(a.userId)?.email ?? "—", createdAt: a.createdAt })), invitations };
}

export async function revokePortalAccess(ctx: TenantContext, accountId: string) {
  assertCan(ctx, "clients:write");
  const res = await db.portalAccount.updateMany({ where: { id: accountId, organizationId: ctx.organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw new NotFoundError("Acesso não encontrado.");
  await audit({ action: "portal.revoke", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "portal_account", resourceId: accountId, meta: ctx.meta });
}

export async function revokePortalInvitation(ctx: TenantContext, invitationId: string) {
  assertCan(ctx, "clients:write");
  const res = await db.invitation.updateMany({ where: { id: invitationId, organizationId: ctx.organizationId, clientId: { not: null }, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw new NotFoundError("Convite não encontrado.");
  await audit({ action: "portal.invite_revoke", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "invitation", resourceId: invitationId, meta: ctx.meta });
}

/** Compartilha (ou deixa de compartilhar) o processo com os clientes vinculados a ele. Só mostra resumo e documentos marcados. */
export async function setCaseSharing(ctx: TenantContext, caseId: string, shared: boolean) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  await db.$transaction(async (tx) => {
    await tx.case.updateMany({ where: { id: caseId, organizationId: ctx.organizationId }, data: { sharedWithPortal: shared } });
    await logCaseEvent(tx, ctx, caseId, { kind: "PORTAL_SHARING", title: shared ? "Processo compartilhado com o portal do cliente" : "Compartilhamento com o portal do cliente removido" });
    await audit({ action: shared ? "portal.case_share" : "portal.case_unshare", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, meta: ctx.meta }, tx);
  });
}

export async function setDocumentSharing(ctx: TenantContext, documentId: string, shared: boolean) {
  assertCan(ctx, "documents:write");
  const doc = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, caseId: true, clientId: true, name: true } });
  if (!doc) throw new NotFoundError("Documento não encontrado.");
  if (doc.caseId) {
    assertCan(ctx, "cases:read");
    await assertCaseVisible(ctx, doc.caseId);
  } else {
    assertCan(ctx, "clients:read");
  }
  await db.$transaction(async (tx) => {
    await tx.document.updateMany({ where: { id: documentId, organizationId: ctx.organizationId }, data: { sharedWithPortal: shared, sharedAt: shared ? new Date() : null } });
    if (doc.caseId) await logCaseEvent(tx, ctx, doc.caseId, { kind: "PORTAL_SHARING", title: `${shared ? "Documento compartilhado com" : "Documento removido d"}${shared ? "" : "o"} portal: ${doc.name}` });
    await audit({ action: shared ? "portal.document_share" : "portal.document_unshare", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: documentId, meta: ctx.meta }, tx);
  });
}

// ======================= lado do cliente (portal) =======================

/** Clientes aos quais o usuário tem acesso ativo ao portal neste escritório. Sem conta ativa = sem acesso a nada. */
async function portalClientIds(ctx: TenantContext): Promise<string[]> {
  if (!ctx.permissions.has("portal:access")) throw new ForbiddenError();
  const rows = await db.portalAccount.findMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId, revokedAt: null }, select: { clientId: true } });
  if (!rows.length) return [];
  const alive = await db.client.findMany({ where: { organizationId: ctx.organizationId, id: { in: rows.map((r) => r.clientId) }, deletedAt: null }, select: { id: true } });
  return alive.map((c) => c.id);
}

export async function hasPortalAccess(ctx: TenantContext) {
  return (await portalClientIds(ctx)).length > 0;
}

function portalCaseWhere(ctx: TenantContext, clientIds: string[]) {
  return { organizationId: ctx.organizationId, deletedAt: null, sharedWithPortal: true, parties: { some: { clientId: { in: clientIds } } } };
}

export async function listPortalCases(ctx: TenantContext) {
  const ids = await portalClientIds(ctx);
  if (!ids.length) return [];
  return db.case.findMany({
    where: portalCaseWhere(ctx, ids),
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, number: true, court: true, status: true, phase: true, updatedAt: true },
  });
}

export async function getPortalCase(ctx: TenantContext, id: string) {
  const ids = await portalClientIds(ctx);
  const c = ids.length ? await db.case.findFirst({ where: { ...portalCaseWhere(ctx, ids), id }, select: { id: true, title: true, number: true, court: true, courtUnit: true, status: true, phase: true, subject: true } }) : null;
  if (!c) throw new NotFoundError("Processo não encontrado.");
  const documents = await db.document.findMany({
    where: { organizationId: ctx.organizationId, caseId: id, sharedWithPortal: true, deletedAt: null },
    orderBy: { sharedAt: "desc" },
    take: 200,
    select: { id: true, name: true, sizeBytes: true, sharedAt: true },
  });
  return { case: c, documents };
}

export async function listPortalDocuments(ctx: TenantContext) {
  const ids = await portalClientIds(ctx);
  if (!ids.length) return [];
  return db.document.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      sharedWithPortal: true,
      OR: [{ clientId: { in: ids } }, { case: { is: portalCaseWhere(ctx, ids) } }],
    },
    orderBy: { sharedAt: "desc" },
    take: 200,
    select: { id: true, name: true, sizeBytes: true, sharedAt: true, case: { select: { id: true, title: true } } },
  });
}

export async function getPortalDocumentForDownload(ctx: TenantContext, id: string) {
  const ids = await portalClientIds(ctx);
  const doc = ids.length
    ? await db.document.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null, sharedWithPortal: true, OR: [{ clientId: { in: ids } }, { case: { is: portalCaseWhere(ctx, ids) } }] },
        select: { id: true, currentVersion: true },
      })
    : null;
  if (!doc) throw new NotFoundError("Documento não encontrado.");
  const v = await db.documentVersion.findFirst({ where: { documentId: doc.id, organizationId: ctx.organizationId, version: doc.currentVersion } });
  if (!v) throw new NotFoundError("Documento não encontrado.");
  await audit({ action: "portal.document_download", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: doc.id, metadata: { version: v.version }, meta: ctx.meta });
  return { id: doc.id, name: v.fileName, mimeType: v.mimeType, sizeBytes: v.sizeBytes, storageKey: v.storageKey };
}
