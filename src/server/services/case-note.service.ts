import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { bulkNoteSchema, caseNoteSchema, BULK_NOTE_MAX } from "@/modules/cases/extras-schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility } from "./case.service";

/** 3.0-F1 — notas internas do processo: fixadas aparecem no topo; uma mesma nota pode ser aplicada a até 50 processos. */

export async function listCaseNotes(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const notes = await db.caseNote.findMany({
    where: { caseId, organizationId: ctx.organizationId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const ids = [...new Set(notes.map((n) => n.authorId).filter((v): v is string => Boolean(v)))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return notes.map((n) => ({ ...n, authorName: n.authorId ? (names.get(n.authorId) ?? null) : null }));
}

export async function addCaseNoteItem(ctx: TenantContext, caseId: string, raw: unknown) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const input = caseNoteSchema.parse(raw);
  const note = await db.caseNote.create({
    data: { organizationId: ctx.organizationId, caseId, authorId: ctx.userId, title: input.title || null, body: input.body, pinned: input.pinned },
  });
  await audit({ action: "case_note.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { noteId: note.id }, meta: ctx.meta });
  return note;
}

export async function setNotePinned(ctx: TenantContext, noteId: string, pinned: boolean) {
  assertCan(ctx, "cases:write");
  const note = await db.caseNote.findFirst({ where: { id: noteId, organizationId: ctx.organizationId }, select: { id: true, caseId: true } });
  if (!note) throw new NotFoundError("Nota não encontrada.");
  await assertCaseVisible(ctx, note.caseId);
  await db.caseNote.update({ where: { id: noteId }, data: { pinned } });
  return note.caseId;
}

export async function deleteCaseNote(ctx: TenantContext, noteId: string) {
  assertCan(ctx, "cases:write");
  const note = await db.caseNote.findFirst({ where: { id: noteId, organizationId: ctx.organizationId }, select: { id: true, caseId: true } });
  if (!note) throw new NotFoundError("Nota não encontrada.");
  await assertCaseVisible(ctx, note.caseId);
  await db.caseNote.delete({ where: { id: noteId } });
  await audit({ action: "case_note.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: note.caseId, metadata: { noteId }, meta: ctx.meta });
  return note.caseId;
}

/**
 * Aplica a mesma nota a vários processos. Tudo ou nada: se algum processo não existir, estiver fora do escritório
 * ou não for visível ao usuário (sigilo), nada é gravado.
 */
export async function addBulkNote(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "cases:write");
  const input = bulkNoteSchema.parse(raw);
  const ids = [...new Set(input.caseIds)];
  if (ids.length > BULK_NOTE_MAX) throw new ValidationError(`No máximo ${BULK_NOTE_MAX} processos por vez.`);
  const visible = await db.case.findMany({ where: { AND: [{ id: { in: ids }, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true } });
  if (visible.length !== ids.length) throw new NotFoundError("Algum dos processos selecionados não foi encontrado.");
  const bulkId = randomUUID();
  await db.$transaction(async (tx) => {
    await tx.caseNote.createMany({
      data: ids.map((caseId) => ({ organizationId: ctx.organizationId, caseId, authorId: ctx.userId, title: input.title || null, body: input.body, pinned: input.pinned, bulkId })),
    });
    await audit({ action: "case_note.bulk", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", metadata: { bulkId, count: ids.length }, meta: ctx.meta }, tx);
  });
  return { count: ids.length, bulkId };
}
