import { z } from "zod";
import { db } from "@/lib/db/client";
import { assertCan, type TenantContext } from "@/server/context";
import { ConflictError, NotFoundError } from "@/lib/permissions/check";
import { TASK_STATUSES } from "@/modules/tasks/schemas";
import { getTask } from "./task.service";
import { recordTaskEvent } from "./task-event";
import { logCaseEvent } from "./case.service";
import { audit } from "./audit.service";
export const stageSchema = z.object({ name: z.string().trim().min(2).max(60), status: z.enum(TASK_STATUSES), position: z.number().int().min(0).max(999), active: z.boolean() });
export async function listTaskStages(ctx: TenantContext) {
  assertCan(ctx, "tasks:read");
  return db.taskStage.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ position: "asc" }, { name: "asc" }] });
}
export async function saveTaskStage(ctx: TenantContext, id: string | null, raw: unknown) {
  assertCan(ctx, "organization:manage");
  const v = stageSchema.parse(raw);
  try {
    return await db.$transaction(async tx => {
      if (id) {
        const cur = await tx.taskStage.findFirst({ where: { id, organizationId: ctx.organizationId } });
        if (!cur) throw new NotFoundError("Etapa não encontrada.");
        if (cur.status !== v.status) throw new ConflictError("O status-base de uma etapa é fixo. Crie outra etapa para mudar o significado.");
      }
      const stage = id ? await tx.taskStage.update({ where: { id }, data: v }) : await tx.taskStage.create({ data: { ...v, organizationId: ctx.organizationId } });
      await audit({ action: id ? "task_stage.update" : "task_stage.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task_stage", resourceId: stage.id, meta: ctx.meta }, tx);
      return stage;
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") throw new ConflictError("Já existe uma etapa com esse nome.");
    throw e;
  }
}
export async function setTaskStage(ctx: TenantContext, taskId: string, stageId: string) {
  assertCan(ctx, "tasks:write");
  const t = await getTask(ctx, taskId);
  const stage = await db.taskStage.findFirst({ where: { id: stageId, organizationId: ctx.organizationId, active: true } });
  if (!stage) throw new NotFoundError("Etapa não encontrada ou desativada.");
  if (t.stageId === stage.id && t.status === stage.status) return;
  await db.$transaction(async tx => {
    const changed = await tx.task.updateMany({ where: { id: t.id, organizationId: ctx.organizationId, updatedAt: t.updatedAt, deletedAt: null }, data: { stageId: stage.id, status: stage.status, completedAt: stage.status === "DONE" ? (t.completedAt ?? new Date()) : null } });
    if (!changed.count) throw new ConflictError("A tarefa mudou. Recarregue antes de escolher a etapa.");
    if (t.caseId && (stage.status === "DONE" || t.status === "DONE")) await logCaseEvent(tx, ctx, t.caseId, { kind: stage.status === "DONE" ? "TASK_DONE" : "TASK_REOPENED", title: `${stage.status === "DONE" ? "Tarefa concluída" : "Tarefa reaberta"}: ${t.title}` });
    await recordTaskEvent(tx, ctx, taskId, "status", `Etapa: ${t.stage?.name ?? t.status} → ${stage.name}`);
    await audit({ action: "task.stage", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task", resourceId: taskId, metadata: { stageId, from: t.status, to: stage.status }, meta: ctx.meta }, tx);
  });
}
