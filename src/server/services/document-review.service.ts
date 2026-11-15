import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { documentVisibilityWhere, loadDocumentChecked } from "./document.service";
import { audit } from "./audit.service";

export async function listDocumentReviews(ctx: TenantContext, documentId?: string, pendingOnly = false) {
  assertCan(ctx, "documents:read");
  if (documentId) await loadDocumentChecked(ctx, documentId);
  const visible = documentVisibilityWhere(ctx);
  if (!visible) return [];
  return db.documentReview.findMany({
    where: { organizationId: ctx.organizationId, documentId, ...(pendingOnly ? { status: "IN_REVIEW" } : {}), document: visible },
    include: { document: { select: { id: true, name: true, currentVersion: true } } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
}

export async function requestDocumentReview(ctx: TenantContext, documentId: string, version: number) {
  assertCan(ctx, "documents:read");
  assertCan(ctx, "documents:write");
  await loadDocumentChecked(ctx, documentId);
  return db.$transaction(async tx => {
    // Lock the same row changed by version uploads, so a decision never races a new version.
    const locked = await tx.$queryRaw<{ current_version: number; uploaded_by_id: string | null }[]>`
      SELECT current_version, uploaded_by_id FROM documents
      WHERE id = ${documentId}::uuid AND organization_id = ${ctx.organizationId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (!locked[0]) throw new NotFoundError();
    if (locked[0].current_version !== version) throw new ConflictError("O documento mudou. Recarregue e confira a nova versão.");
    const pending = await tx.documentReview.findFirst({ where: { documentId, status: "IN_REVIEW" } });
    if (pending) throw new ConflictError("Este documento já está em revisão.");
    const review = await tx.documentReview.create({ data: { documentId, organizationId: ctx.organizationId, version, requestedById: ctx.userId } });
    await audit({ action: "document.review.request", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: documentId, metadata: { reviewId: review.id, version }, meta: ctx.meta }, tx);
    return review;
  });
}

export async function decideDocumentReview(ctx: TenantContext, reviewId: string, decision: "APPROVED" | "CHANGES_REQUESTED", note: string) {
  assertCan(ctx, "documents:read");
  assertCan(ctx, "documents:write");
  if (!["APPROVED", "CHANGES_REQUESTED"].includes(decision)) throw new ValidationError("Decisão inválida.");
  const cleanNote = note.trim();
  if (cleanNote.length > 2000 || (decision === "CHANGES_REQUESTED" && !cleanNote)) throw new ValidationError("Informe os ajustes necessários (até 2000 caracteres).");
  const review = await db.documentReview.findFirst({ where: { id: reviewId, organizationId: ctx.organizationId } });
  if (!review) throw new NotFoundError();
  await loadDocumentChecked(ctx, review.documentId);
  if (review.requestedById === ctx.userId) throw new ForbiddenError("A conferência deve ser feita por outra pessoa.");
  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ current_version: number }[]>`
      SELECT current_version FROM documents WHERE id = ${review.documentId}::uuid
      AND organization_id = ${ctx.organizationId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (!locked[0]) throw new NotFoundError();
    if (locked[0].current_version !== review.version) throw new ConflictError("Há uma nova versão. Solicite outra revisão.");
    const version = await tx.documentVersion.findFirst({ where: { documentId: review.documentId, version: review.version } });
    if (version?.uploadedById === ctx.userId) throw new ForbiddenError("Quem enviou a versão não pode aprová-la nem conferir seus próprios ajustes.");
    const changed = await tx.documentReview.updateMany({ where: { id: reviewId, organizationId: ctx.organizationId, status: "IN_REVIEW" }, data: { status: decision, note: cleanNote || null, reviewedById: ctx.userId, reviewedAt: new Date() } });
    if (!changed.count) throw new ConflictError("Esta revisão já foi encerrada. Recarregue a página.");
    await audit({ action: "document.review.decide", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "document", resourceId: review.documentId, metadata: { reviewId, version: review.version, decision }, meta: ctx.meta }, tx);
  });
}
