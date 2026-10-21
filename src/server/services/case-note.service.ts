import { createHash, randomUUID } from "node:crypto";
import { db, type Tx } from "@/lib/db/client";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { deleteObject, putObject } from "@/lib/storage/local-storage";
import { bulkNoteSchema, caseNoteSchema, BULK_NOTE_MAX } from "@/modules/cases/extras-schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility } from "./case.service";
import { classifyFile } from "./document.service";
import { assertStorageAvailable } from "./plan.service";

/**
 * 3.0-F1 — notas internas do processo: fixadas aparecem no topo; uma mesma nota pode ser aplicada a até 50 processos.
 * Com anexos e histórico de alterações (criada, editada com o texto anterior, fixada, anexo, excluída).
 */

export const NOTE_PREVIOUS_MAX = 4000;

async function recordNoteEvent(tx: Tx | typeof db, ctx: TenantContext, caseId: string, noteId: string, kind: string, detail: string, previous?: string | null) {
  await tx.caseNoteEvent.create({ data: { organizationId: ctx.organizationId, caseId, noteId, userId: ctx.userId, kind, detail: detail.slice(0, 300), previous: previous ? previous.slice(0, NOTE_PREVIOUS_MAX) : null } });
}

export async function listCaseNotes(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const notes = await db.caseNote.findMany({
    where: { caseId, organizationId: ctx.organizationId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, sizeBytes: true } } },
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
  const note = await db.$transaction(async (tx) => {
    const n = await tx.caseNote.create({
      data: { organizationId: ctx.organizationId, caseId, authorId: ctx.userId, title: input.title || null, body: input.body, pinned: input.pinned },
    });
    await recordNoteEvent(tx, ctx, caseId, n.id, "created", `Nota criada${input.title ? `: ${input.title}` : ""}${input.pinned ? " (fixada)" : ""}`);
    await audit({ action: "case_note.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { noteId: n.id }, meta: ctx.meta }, tx);
    return n;
  });
  return note;
}

export async function setNotePinned(ctx: TenantContext, noteId: string, pinned: boolean) {
  assertCan(ctx, "cases:write");
  const note = await db.caseNote.findFirst({ where: { id: noteId, organizationId: ctx.organizationId }, select: { id: true, caseId: true } });
  if (!note) throw new NotFoundError("Nota não encontrada.");
  await assertCaseVisible(ctx, note.caseId);
  await db.$transaction(async (tx) => {
    await tx.caseNote.update({ where: { id: noteId }, data: { pinned } });
    await recordNoteEvent(tx, ctx, note.caseId, noteId, pinned ? "pinned" : "unpinned", pinned ? "Nota fixada" : "Nota desafixada");
  });
  return note.caseId;
}

export async function deleteCaseNote(ctx: TenantContext, noteId: string) {
  assertCan(ctx, "cases:write");
  const note = await db.caseNote.findFirst({ where: { id: noteId, organizationId: ctx.organizationId }, select: { id: true, caseId: true } });
  if (!note) throw new NotFoundError("Nota não encontrada.");
  await assertCaseVisible(ctx, note.caseId);
  const files = await db.caseNoteAttachment.findMany({ where: { noteId }, select: { storageKey: true } });
  const before = await db.caseNote.findUniqueOrThrow({ where: { id: noteId }, select: { title: true, body: true } });
  await db.$transaction(async (tx) => {
    await tx.caseNote.delete({ where: { id: noteId } });
    await recordNoteEvent(tx, ctx, note.caseId, noteId, "deleted", `Nota excluída${before.title ? `: ${before.title}` : ""}`, before.body);
    await audit({ action: "case_note.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: note.caseId, metadata: { noteId }, meta: ctx.meta }, tx);
  });
  await Promise.all(files.map((f) => deleteObject(f.storageKey).catch(() => undefined)));
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
    const created = await Promise.all(
      ids.map((caseId) => tx.caseNote.create({ data: { organizationId: ctx.organizationId, caseId, authorId: ctx.userId, title: input.title || null, body: input.body, pinned: input.pinned, bulkId }, select: { id: true, caseId: true } })),
    );
    await tx.caseNoteEvent.createMany({ data: created.map((n) => ({ organizationId: ctx.organizationId, caseId: n.caseId, noteId: n.id, userId: ctx.userId, kind: "created", detail: `Nota aplicada em lote (${ids.length} processos)` })) });
    await audit({ action: "case_note.bulk", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", metadata: { bulkId, count: ids.length }, meta: ctx.meta }, tx);
  });
  return { count: ids.length, bulkId };
}

// ---------------- edição, anexos e histórico ----------------

/** Edita título e texto; o texto anterior fica no histórico. Fixar/desafixar tem ação própria. */
export async function updateCaseNote(ctx: TenantContext, noteId: string, raw: { title?: string | null; body: string }) {
  assertCan(ctx, "cases:write");
  const note = await db.caseNote.findFirst({ where: { id: noteId, organizationId: ctx.organizationId } });
  if (!note) throw new NotFoundError("Nota não encontrada.");
  await assertCaseVisible(ctx, note.caseId);
  const parsed = caseNoteSchema.pick({ title: true, body: true }).parse({ title: raw.title ?? "", body: raw.body });
  const title = parsed.title || null;
  if (title === note.title && parsed.body === note.body) return note.caseId;
  await db.$transaction(async (tx) => {
    await tx.caseNote.update({ where: { id: noteId }, data: { title, body: parsed.body } });
    await recordNoteEvent(tx, ctx, note.caseId, noteId, "edited", title !== note.title && parsed.body === note.body ? "Título alterado" : "Nota editada", `${note.title ? `[${note.title}]\n` : ""}${note.body}`);
    await audit({ action: "case_note.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: note.caseId, metadata: { noteId }, meta: ctx.meta }, tx);
  });
  return note.caseId;
}

export async function listNoteHistory(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const rows = await db.caseNoteEvent.findMany({ where: { caseId, organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 100 });
  const ids = [...new Set(rows.map((r) => r.userId).filter((v): v is string => Boolean(v)))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, noteId: r.noteId, kind: r.kind, detail: r.detail, previous: r.previous, createdAt: r.createdAt, userName: r.userId ? (names.get(r.userId) ?? "Usuário removido") : "Sistema" }));
}

export const NOTE_MAX_ATTACHMENTS = 10;

export async function addNoteAttachment(ctx: TenantContext, noteId: string, file: { name: string; buffer: Buffer }) {
  assertCan(ctx, "cases:write");
  const note = await db.caseNote.findFirst({ where: { id: noteId, organizationId: ctx.organizationId }, select: { id: true, caseId: true } });
  if (!note) throw new NotFoundError("Nota não encontrada.");
  await assertCaseVisible(ctx, note.caseId);
  const count = await db.caseNoteAttachment.count({ where: { noteId, deletedAt: null } });
  if (count >= NOTE_MAX_ATTACHMENTS) throw new ValidationError(`No máximo ${NOTE_MAX_ATTACHMENTS} anexos por nota.`, { file: [`No máximo ${NOTE_MAX_ATTACHMENTS} anexos por nota.`] });
  const { name, mime } = classifyFile(file.name, file.buffer);
  await assertStorageAvailable(ctx.organizationId, file.buffer.length);
  const key = `${ctx.organizationId}/${randomUUID()}`;
  await putObject(key, file.buffer);
  const sha256 = createHash("sha256").update(file.buffer).digest("hex");
  try {
    await db.$transaction(async (tx) => {
      await tx.caseNoteAttachment.create({ data: { organizationId: ctx.organizationId, noteId, name, mimeType: mime, sizeBytes: file.buffer.length, sha256, storageKey: key, uploadedById: ctx.userId } });
      await recordNoteEvent(tx, ctx, note.caseId, noteId, "attachment_added", `Anexo adicionado: ${name}`);
      await audit({ action: "case_note.attachment_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: note.caseId, metadata: { noteId }, meta: ctx.meta }, tx);
    });
  } catch (e) {
    await deleteObject(key);
    throw e;
  }
  return note.caseId;
}

export async function getNoteAttachmentForDownload(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:read");
  const a = await db.caseNoteAttachment.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, include: { note: { select: { caseId: true } } } });
  if (!a) throw new NotFoundError("Anexo não encontrado.");
  await assertCaseVisible(ctx, a.note.caseId); // respeita o sigilo do processo
  return a;
}

export async function deleteNoteAttachment(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:write");
  const a = await getNoteAttachmentForDownload(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.caseNoteAttachment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordNoteEvent(tx, ctx, a.note.caseId, a.noteId, "attachment_removed", `Anexo removido: ${a.name}`);
    await audit({ action: "case_note.attachment_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: a.note.caseId, metadata: { noteId: a.noteId }, meta: ctx.meta }, tx);
  });
  return a.note.caseId;
}
