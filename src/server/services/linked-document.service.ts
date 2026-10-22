import { db } from "@/lib/db/client";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, logCaseEvent } from "./case.service";

const kindOf = (host: string) => (host === "docs.google.com" ? "GOOGLE_DOCS" : host === "drive.google.com" ? "DRIVE" : "URL");

export function parseHttpsUrl(raw: string): { url: string; kind: string } {
  const t = raw.trim();
  let u: URL;
  try { u = new URL(t); } catch { throw new ValidationError("Link inválido.", { url: ["Link inválido."] }); }
  if (u.protocol !== "https:") throw new ValidationError("O link deve começar com https://", { url: ["O link deve começar com https://"] });
  if (u.username || u.password) throw new ValidationError("O link não pode conter usuário e senha.", { url: ["O link não pode conter usuário e senha."] });
  return { url: t.slice(0, 1000), kind: kindOf(u.hostname) };
}

export async function listLinkedDocuments(ctx: TenantContext, owner: { caseId?: string; clientId?: string }) {
  assertCan(ctx, "documents:read");
  if (owner.caseId) await assertCaseVisible(ctx, owner.caseId);
  return db.linkedDocument.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, isModel: false, ...(owner.caseId ? { caseId: owner.caseId } : {}), ...(owner.clientId ? { clientId: owner.clientId } : {}) },
    orderBy: [{ originalAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: { id: true, name: true, url: true, kind: true, source: true, originalAt: true, createdAt: true },
  });
}

export async function listLinkedModels(ctx: TenantContext) {
  assertCan(ctx, "documents:read");
  return db.linkedDocument.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, isModel: true }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, url: true, kind: true } });
}

export async function addLinkedDocument(ctx: TenantContext, owner: { caseId?: string; clientId?: string }, input: { name: string; url: string }) {
  assertCan(ctx, "documents:write");
  const name = input.name.trim();
  if (name.length < 2) throw new ValidationError("Informe o nome do documento.", { name: ["Informe o nome do documento."] });
  if (!owner.caseId && !owner.clientId) throw new ValidationError("Escolha o processo ou o cliente.");
  const { url, kind } = parseHttpsUrl(input.url);
  if (owner.caseId) await assertCaseVisible(ctx, owner.caseId);
  if (owner.clientId && !(await db.client.findFirst({ where: { id: owner.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } }))) throw new NotFoundError("Cliente não encontrado.");
  return db.$transaction(async (tx) => {
    const d = await tx.linkedDocument.create({ data: { organizationId: ctx.organizationId, caseId: owner.caseId ?? null, clientId: owner.caseId ? null : (owner.clientId ?? null), name: name.slice(0, 200), url, kind, source: "MANUAL", createdById: ctx.userId }, select: { id: true } });
    if (owner.caseId) await logCaseEvent(tx, ctx, owner.caseId, { kind: "LINKED_DOC_ADDED", title: `Documento por link: ${name.slice(0, 120)}` });
    await audit({ action: "document.link_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "linked_document", resourceId: d.id, meta: ctx.meta }, tx);
    return d;
  });
}

export async function removeLinkedDocument(ctx: TenantContext, id: string) {
  assertCan(ctx, "documents:write");
  const doc = await db.linkedDocument.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: { caseId: true } });
  if (!doc) throw new NotFoundError("Documento não encontrado.");
  if (doc.caseId) await assertCaseVisible(ctx, doc.caseId);
  await db.linkedDocument.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "document.link_remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "linked_document", resourceId: id, meta: ctx.meta });
}
