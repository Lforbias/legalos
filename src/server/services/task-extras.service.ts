import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { deleteObject, putObject } from "@/lib/storage/local-storage";
import { classifyFile } from "./document.service";
import { assertStorageAvailable } from "./plan.service";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { userNames } from "./members";
import { recordTaskEvent } from "./task-event";
import { getTask } from "./task.service";
import { classificationSchema, taskLabelSchema, taskTypeSchema, type ClassificationInput, type TaskLabelInput, type TaskTypeInput } from "@/modules/tasks/extras-schemas";

const dupMessage = (e: unknown, field: string, msg: string) => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationError(msg, { [field]: [msg] });
  throw e;
};

/* ---------- tipos de tarefa (com pontuação) ---------- */
export async function listTaskTypes(ctx: TenantContext, opts: { onlyActive?: boolean } = {}) {
  assertCan(ctx, "tasks:read");
  return db.taskType.findMany({ where: { organizationId: ctx.organizationId, ...(opts.onlyActive ? { active: true } : {}) }, orderBy: { name: "asc" } });
}

export async function saveTaskType(ctx: TenantContext, id: string | null, raw: TaskTypeInput & { active?: boolean }) {
  assertCan(ctx, "organization:manage");
  const input = taskTypeSchema.parse(raw);
  try {
    if (id) {
      const cur = await db.taskType.findFirst({ where: { id, organizationId: ctx.organizationId } });
      if (!cur) throw new NotFoundError("Tipo de tarefa não encontrado.");
      await db.taskType.update({ where: { id }, data: { name: input.name, points: input.points, ...(raw.active === undefined ? {} : { active: raw.active }) } });
    } else {
      await db.taskType.create({ data: { organizationId: ctx.organizationId, name: input.name, points: input.points } });
    }
  } catch (e) {
    dupMessage(e, "name", "Já existe um tipo com esse nome.");
  }
  await audit({ action: id ? "task_type.update" : "task_type.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task_type", resourceId: id ?? undefined, meta: ctx.meta });
}

export async function deleteTaskType(ctx: TenantContext, id: string) {
  assertCan(ctx, "organization:manage");
  const cur = await db.taskType.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!cur) throw new NotFoundError("Tipo de tarefa não encontrado.");
  await db.taskType.delete({ where: { id } }); // tarefas ficam sem tipo (FK SET NULL)
  await audit({ action: "task_type.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task_type", resourceId: id, meta: ctx.meta });
}

/* ---------- etiquetas ---------- */
export async function listTaskLabels(ctx: TenantContext) {
  assertCan(ctx, "tasks:read");
  return db.taskLabel.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" } });
}

export async function saveTaskLabel(ctx: TenantContext, id: string | null, raw: TaskLabelInput) {
  assertCan(ctx, "organization:manage");
  const input = taskLabelSchema.parse(raw);
  try {
    if (id) {
      const cur = await db.taskLabel.findFirst({ where: { id, organizationId: ctx.organizationId } });
      if (!cur) throw new NotFoundError("Etiqueta não encontrada.");
      await db.taskLabel.update({ where: { id }, data: input });
    } else {
      await db.taskLabel.create({ data: { organizationId: ctx.organizationId, ...input } });
    }
  } catch (e) {
    dupMessage(e, "name", "Já existe uma etiqueta com esse nome.");
  }
  await audit({ action: id ? "task_label.update" : "task_label.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task_label", resourceId: id ?? undefined, meta: ctx.meta });
}

export async function deleteTaskLabel(ctx: TenantContext, id: string) {
  assertCan(ctx, "organization:manage");
  const cur = await db.taskLabel.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!cur) throw new NotFoundError("Etiqueta não encontrada.");
  await db.taskLabel.delete({ where: { id } });
  await audit({ action: "task_label.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task_label", resourceId: id, meta: ctx.meta });
}

/* ---------- classificação da tarefa (tipo + etiquetas) ---------- */
export async function getTaskClassification(ctx: TenantContext, taskId: string) {
  const t = await getTask(ctx, taskId);
  const row = await db.task.findUnique({ where: { id: t.id }, select: { type: { select: { id: true, name: true, points: true } }, labels: { select: { label: { select: { id: true, name: true, color: true } } } } } });
  return { type: row?.type ?? null, labels: (row?.labels ?? []).map((l) => l.label).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) };
}

export async function setTaskClassification(ctx: TenantContext, taskId: string, raw: ClassificationInput) {
  assertCan(ctx, "tasks:write");
  const input = classificationSchema.parse(raw);
  const t = await getTask(ctx, taskId);
  const before = await getTaskClassification(ctx, taskId);
  let typeName: string | null = null;
  if (input.typeId) {
    const ty = await db.taskType.findFirst({ where: { id: input.typeId, organizationId: ctx.organizationId, active: true } });
    if (!ty) throw new ValidationError("Tipo de tarefa não encontrado.", { typeId: ["Selecione um tipo válido."] });
    typeName = ty.name;
  }
  const labelIds = [...new Set(input.labelIds)];
  const labels = labelIds.length ? await db.taskLabel.findMany({ where: { id: { in: labelIds }, organizationId: ctx.organizationId } }) : [];
  if (labels.length !== labelIds.length) throw new ValidationError("Etiqueta não encontrada.", { labelIds: ["Selecione etiquetas válidas."] });
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: t.id }, data: { typeId: input.typeId || null } });
    await tx.taskLabelLink.deleteMany({ where: { taskId: t.id } });
    if (labelIds.length) await tx.taskLabelLink.createMany({ data: labelIds.map((labelId) => ({ taskId: t.id, labelId })) });
    if ((before.type?.id ?? "") !== input.typeId) await recordTaskEvent(tx, ctx, t.id, "type", `Tipo: ${before.type?.name ?? "sem tipo"} → ${typeName ?? "sem tipo"}`);
    const prev = before.labels.map((l) => l.name).join(", ") || "nenhuma";
    const next = labels.map((l) => l.name).sort((a, b) => a.localeCompare(b, "pt-BR")).join(", ") || "nenhuma";
    if (prev !== next) await recordTaskEvent(tx, ctx, t.id, "labels", `Etiquetas: ${prev} → ${next}`);
  });
}

/* ---------- histórico ---------- */
export async function listTaskEvents(ctx: TenantContext, taskId: string) {
  const t = await getTask(ctx, taskId);
  const rows = await db.taskEvent.findMany({ where: { taskId: t.id, organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 200 });
  const names = await userNames(ctx, rows.map((r) => r.userId));
  return rows.map((r) => ({ ...r, userName: r.userId ? (names.get(r.userId) ?? "Usuário removido") : "Sistema" }));
}

/* ---------- anexos ---------- */
export async function listTaskAttachments(ctx: TenantContext, taskId: string) {
  const t = await getTask(ctx, taskId);
  const rows = await db.taskAttachment.findMany({ where: { taskId: t.id, organizationId: ctx.organizationId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
  const names = await userNames(ctx, rows.map((r) => r.uploadedById));
  return rows.map((r) => ({ id: r.id, name: r.name, sizeBytes: r.sizeBytes, createdAt: r.createdAt, uploadedByName: r.uploadedById ? (names.get(r.uploadedById) ?? null) : null }));
}

export async function addTaskAttachment(ctx: TenantContext, taskId: string, file: { name: string; buffer: Buffer }) {
  assertCan(ctx, "tasks:write");
  const t = await getTask(ctx, taskId);
  const { name, mime } = classifyFile(file.name, file.buffer);
  await assertStorageAvailable(ctx.organizationId, file.buffer.length);
  const key = `${ctx.organizationId}/${randomUUID()}`;
  await putObject(key, file.buffer);
  const sha256 = createHash("sha256").update(file.buffer).digest("hex");
  try {
    await db.$transaction(async (tx) => {
      await tx.taskAttachment.create({ data: { organizationId: ctx.organizationId, taskId: t.id, name, mimeType: mime, sizeBytes: file.buffer.length, sha256, storageKey: key, uploadedById: ctx.userId } });
      await recordTaskEvent(tx, ctx, t.id, "attachment", `Anexo adicionado: ${name}`);
      await audit({ action: "task.attachment.add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task", resourceId: t.id, meta: ctx.meta }, tx);
    });
  } catch (e) {
    await deleteObject(key);
    throw e;
  }
}

export async function getTaskAttachmentForDownload(ctx: TenantContext, id: string) {
  assertCan(ctx, "tasks:read");
  const a = await db.taskAttachment.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!a) throw new NotFoundError("Anexo não encontrado.");
  await getTask(ctx, a.taskId); // respeita o sigilo do processo da tarefa
  return a;
}

export async function deleteTaskAttachment(ctx: TenantContext, id: string) {
  assertCan(ctx, "tasks:write");
  const a = await getTaskAttachmentForDownload(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.taskAttachment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordTaskEvent(tx, ctx, a.taskId, "attachment", `Anexo removido: ${a.name}`);
    await audit({ action: "task.attachment.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task", resourceId: a.taskId, meta: ctx.meta }, tx);
  });
}

/* ---------- pontuação ---------- */
/** Pontos das tarefas concluídas no período, por responsável (só tarefas com tipo; respeita o sigilo de processos). */
export async function pointsReport(ctx: TenantContext, from: Date, to: Date) {
  assertCan(ctx, "tasks:read");
  const rows = await db.task.findMany({
    where: {
      organizationId: ctx.organizationId, deletedAt: null, status: "DONE", completedAt: { gte: from, lt: to }, typeId: { not: null },
      OR: [{ caseId: null }, { case: { deletedAt: null } }],
    },
    select: { assigneeId: true, type: { select: { points: true } } },
  });
  const by = new Map<string, { points: number; tasks: number }>();
  for (const r of rows) {
    const k = r.assigneeId ?? "";
    const cur = by.get(k) ?? { points: 0, tasks: 0 };
    cur.points += r.type?.points ?? 0;
    cur.tasks += 1;
    by.set(k, cur);
  }
  const names = await userNames(ctx, [...by.keys()]);
  return [...by.entries()].map(([id, v]) => ({ userId: id || null, name: id ? (names.get(id) ?? "Usuário removido") : "Sem responsável", ...v })).sort((a, b) => b.points - a.points);
}
