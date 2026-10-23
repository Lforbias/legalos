import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { assertCan, type TenantContext } from "@/server/context";
import { assertCaseVisible } from "./case.service";
import { loadDocumentChecked } from "./document.service";
import { audit } from "./audit.service";

/** Índice paginado dos autos, sempre restrito ao processo visível. Busca também no texto já extraído. */
export async function listCaseAutos(ctx: TenantContext, caseId: string, filters: { q?: string; favorites?: boolean; page?: number } = {}) {
  assertCan(ctx, "documents:read");
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const q = filters.q?.trim().slice(0, 150);
  const where: Prisma.DocumentWhereInput = {
    organizationId: ctx.organizationId, caseId, deletedAt: null,
    ...(filters.favorites ? { bookmarks: { some: { organizationId: ctx.organizationId, userId: ctx.userId } } } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { texts: { some: { organizationId: ctx.organizationId, status: "EXTRACTED", searchText: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const total = await db.document.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / 50));
  const page = Math.min(pageCount, Math.max(1, Math.floor(filters.page || 1)));
  const [items, lastSync] = await Promise.all([
    db.document.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 50, take: 50,
      select: { id: true, name: true, category: true, mimeType: true, sizeBytes: true, createdAt: true, currentVersion: true, externalKey: true, bookmarks: { where: { organizationId: ctx.organizationId, userId: ctx.userId }, select: { id: true } } } }),
    db.auditLog.findFirst({ where: { organizationId: ctx.organizationId, resourceType: "case", resourceId: caseId, action: { in: ["mni.import_autos", "mni.import_autos_failed"] } }, orderBy: { createdAt: "desc" }, select: { action: true, createdAt: true, metadata: true } }),
  ]);
  return { items: items.map(({ bookmarks, ...d }) => ({ ...d, favorite: bookmarks.length > 0 })), total, page, pageCount, lastSync };
}

export async function setDocumentBookmark(ctx: TenantContext, documentId: string, favorite: boolean) {
  assertCan(ctx, "documents:read");
  await loadDocumentChecked(ctx, documentId);
  await db.$transaction(async tx => {
    if (favorite) await tx.documentBookmark.createMany({ data: [{ organizationId: ctx.organizationId, userId: ctx.userId, documentId }], skipDuplicates: true });
    else await tx.documentBookmark.deleteMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId, documentId } });
    await audit({ action: favorite ? "document.favorite" : "document.unfavorite", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: documentId, meta: ctx.meta }, tx);
  });
}
