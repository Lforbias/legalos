import { assertTaskReady, advanceTaskDependencies } from "./task-dependency";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { formatYmd, todayYmd } from "@/lib/dates/ymd";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { commentSchema, taskSchema, toTaskData, TASK_STATUS_LABEL, type CommentInput, type TaskInput } from "@/modules/tasks/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertActiveMember, assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";
import { listActiveMembers, userNames } from "./members";
import { recordTaskEvent } from "./task-event";
import { findMentions } from "@/modules/tasks/mentions";
import { TASK_PRIORITY_LABEL } from "@/modules/tasks/schemas";
import { assertNoticeUsable } from "./notice-guard";
import { notify } from "./notification.service";

type Status = (typeof import("@/modules/tasks/schemas").TASK_STATUSES)[number];

/** Tarefas sem processo são do escritório; as vinculadas a processo respeitam o sigilo do processo. */
export function taskVisibility(ctx: TenantContext): Prisma.TaskWhereInput {
  return { OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] };
}

export type TaskFilters = { stageId?: string; labelId?: string; typeId?: string; q?: string; status?: Status; assigneeId?: string; caseId?: string; clientId?: string; overdue?: boolean; includeClosed?: boolean };

export async function listTasks(ctx: TenantContext, f: TaskFilters = {}) {
  assertCan(ctx, "tasks:read");
  const and: Prisma.TaskWhereInput[] = [{ organizationId: ctx.organizationId, deletedAt: null }, taskVisibility(ctx)];
  if (f.status) and.push({ status: f.status });
  else if (!f.includeClosed) and.push({ status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } });
  if (f.assigneeId) and.push({ assigneeId: f.assigneeId });
  if (f.caseId) and.push({ caseId: f.caseId });
  if (f.labelId) and.push({ labels: { some: { labelId: f.labelId } } });
  if (f.stageId) and.push({ stageId: f.stageId });
  if (f.typeId) and.push({ typeId: f.typeId });
  if (f.clientId) and.push({ clientId: f.clientId });
  if (f.overdue) and.push({ status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, dueDate: { lt: new Date(`${todayYmd(ctx.timezone)}T00:00:00Z`) } });
  const q = f.q?.trim().slice(0, 80);
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
  const where: Prisma.TaskWhereInput = { AND: and };
  const [total, rows] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({
      where,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }],
      take: 300,
      include: { stage: { select: { id: true, name: true } }, case: { select: { id: true, title: true } }, client: { select: { id: true, name: true } }, type: { select: { name: true, points: true } }, labels: { select: { label: { select: { id: true, name: true, color: true } } } } },
    }),
  ]);
  const names = await userNames(ctx, rows.map((r) => r.assigneeId));
  return { total, truncated: total > rows.length, items: rows.map((r) => ({ ...r, assigneeName: r.assigneeId ? (names.get(r.assigneeId) ?? null) : null })) };
}

export async function getTask(ctx: TenantContext, id: string) {
  assertCan(ctx, "tasks:read");
  const t = await db.task.findFirst({
    where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, taskVisibility(ctx)] },
    include: {
      stage: { select: { id: true, name: true } },
      case: { select: { id: true, title: true, number: true } },
      client: { select: { id: true, name: true } },
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!t) throw new NotFoundError("Tarefa não encontrada.");
  const names = await userNames(ctx, [t.assigneeId, t.createdById, ...t.comments.map((c) => c.authorId)]);
  return {
    ...t,
    assigneeName: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null,
    createdByName: t.createdById ? (names.get(t.createdById) ?? null) : null,
    comments: t.comments.map((c) => ({ ...c, authorName: c.authorId ? (names.get(c.authorId) ?? "Usuário removido") : "Sistema" })),
  };
}

async function validateLinks(ctx: TenantContext, data: ReturnType<typeof toTaskData>) {
  if (data.assigneeId) await assertActiveMember(ctx, data.assigneeId);
  if (data.caseId) await assertCaseVisible(ctx, data.caseId);
  if (data.clientId) {
    assertCan(ctx, "clients:read");
    const c = await db.client.findFirst({ where: { id: data.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
    if (!c) throw new ValidationError("Cliente não encontrado.", { clientId: ["Selecione um cliente válido."] });
  }
}

async function notifyAssignment(ctx: TenantContext, task: { id: string; title: string }, assigneeId: string | null) {
  if (!assigneeId || assigneeId === ctx.userId) return;
  await notify({
    organizationId: ctx.organizationId,
    userId: assigneeId,
    kind: "task.assigned",
    title: `Nova tarefa para você: ${task.title}`,
    link: `/tarefas/${task.id}`,
    dedupeKey: `task-assigned:${task.id}:${assigneeId}`,
  });
}

export async function createTask(ctx: TenantContext, raw: TaskInput, opts: { sourceNoticeId?: string } = {}) {
  assertCan(ctx, "tasks:write");
  const data = toTaskData(taskSchema.parse(raw));
  await validateLinks(ctx, data);
  if (opts.sourceNoticeId) await assertNoticeUsable(ctx, opts.sourceNoticeId);
  const created = await db.$transaction(async (tx) => {
    const t = await tx.task.create({
      data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId, sourceNoticeId: opts.sourceNoticeId ?? null, completedAt: data.status === "DONE" ? new Date() : null },
    });
    if (t.caseId) await logCaseEvent(tx, ctx, t.caseId, { kind: "TASK_CREATED", title: `Tarefa criada: ${t.title}` });
    await recordTaskEvent(tx, ctx, t.id, "created", "Tarefa criada");
    await audit({ action: "task.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task", resourceId: t.id, meta: ctx.meta }, tx);
    return t;
  });
  await notifyAssignment(ctx, created, created.assigneeId);
  return created;
}

export async function updateTask(ctx: TenantContext, id: string, raw: TaskInput) {
  assertCan(ctx, "tasks:write");
  const data = toTaskData(taskSchema.parse(raw));
  const current = await getTask(ctx, id);
  await validateLinks(ctx, data);
  await db.$transaction(async (tx) => {
    await assertTaskReady(tx,ctx,id,data.status);
    const changed=await tx.task.updateMany({
      where: { id, organizationId:ctx.organizationId, updatedAt:current.updatedAt, deletedAt:null },
      data: { ...data, ...(data.status !== current.status ? { stageId: null } : {}), completedAt: data.status === "DONE" ? (current.completedAt ?? new Date()) : null },
    });
    if(changed.count!==1)throw new ConflictError("A tarefa mudou. Recarregue antes de salvar.");
    if(data.status!==current.status&&(data.status==="DONE"||current.status==="DONE"))await advanceTaskDependencies(tx,ctx,id,data.status==="DONE");
    const changes: string[] = [];
    if (data.title !== current.title) changes.push(`Título: “${current.title}” → “${data.title}”`);
    if (data.status !== current.status) changes.push(`Situação: ${TASK_STATUS_LABEL[current.status]} → ${TASK_STATUS_LABEL[data.status]}`);
    if (data.priority !== current.priority) changes.push(`Prioridade: ${TASK_PRIORITY_LABEL[current.priority]} → ${TASK_PRIORITY_LABEL[data.priority]}`);
    const oldDue = current.dueDate ? current.dueDate.toISOString().slice(0, 10) : "";
    const newDue = data.dueDate ? data.dueDate.toISOString().slice(0, 10) : "";
    if (oldDue !== newDue) changes.push(`Vencimento: ${oldDue ? formatYmd(oldDue) : "sem data"} → ${newDue ? formatYmd(newDue) : "sem data"}`);
    if (data.assigneeId !== current.assigneeId) {
      const nm = await userNames(ctx, [data.assigneeId]);
      changes.push(`Responsável: ${current.assigneeName ?? "ninguém"} → ${data.assigneeId ? (nm.get(data.assigneeId) ?? "outro usuário") : "ninguém"}`);
    }
    if ((data.description ?? "") !== (current.description ?? "")) changes.push("Descrição alterada");
    for (const c of changes) await recordTaskEvent(tx, ctx, id, "update", c);
    await audit({ action: "task.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task", resourceId: id, meta: ctx.meta }, tx);
  });
  if (data.assigneeId !== current.assigneeId) await notifyAssignment(ctx, { id, title: data.title }, data.assigneeId);
}

export async function changeTaskStatus(ctx: TenantContext, id: string, status: Status) {
  assertCan(ctx, "tasks:write");
  const t = await getTask(ctx, id);
  if (t.status === status && !t.stageId) return;
  await db.$transaction(async (tx) => {
    await assertTaskReady(tx,ctx,id,status);
    const changed=await tx.task.updateMany({ where: { id,organizationId:ctx.organizationId,updatedAt:t.updatedAt,deletedAt:null }, data: { status, stageId: null, completedAt: status === "DONE" ? (t.completedAt ?? new Date()) : null } });
    if(changed.count!==1)throw new ConflictError("A tarefa mudou. Recarregue antes de alterar.");
    if(status!==t.status&&(status==="DONE"||t.status==="DONE"))await advanceTaskDependencies(tx,ctx,id,status==="DONE");
    if (t.caseId && t.status !== status && (status === "DONE" || t.status === "DONE")) {
      await logCaseEvent(tx, ctx, t.caseId, { kind: status === "DONE" ? "TASK_DONE" : "TASK_REOPENED", title: `${status === "DONE" ? "Tarefa concluída" : "Tarefa reaberta"}: ${t.title}` });
    }
    await recordTaskEvent(tx, ctx, id, "status", t.stage ? `Etapa ${t.stage.name} removida; situação: ${TASK_STATUS_LABEL[status]}` : `Situação: ${TASK_STATUS_LABEL[t.status]} → ${TASK_STATUS_LABEL[status]}`);
    await audit(
      { action: "task.status", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task", resourceId: id, metadata: { from: t.status, to: status, label: TASK_STATUS_LABEL[status] }, meta: ctx.meta },
      tx,
    );
  });
}

export async function deleteTask(ctx: TenantContext, id: string) {
  assertCan(ctx, "tasks:write");
  await getTask(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ action: "task.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "task", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function addTaskComment(ctx: TenantContext, taskId: string, raw: CommentInput) {
  assertCan(ctx, "tasks:write");
  const input = commentSchema.parse(raw);
  const t = await getTask(ctx, taskId);
  const members = await listActiveMembers(ctx);
  const mentioned = findMentions(input.body, members).filter((m) => m !== ctx.userId);
  await db.taskComment.create({ data: { organizationId: ctx.organizationId, taskId, authorId: ctx.userId, body: input.body, mentionedIds: mentioned } });
  const targets = new Set([t.assigneeId, t.createdById].filter((x): x is string => !!x && x !== ctx.userId && !mentioned.includes(x)));
  const msgs = [
    ...[...targets].map((userId) => ({
      organizationId: ctx.organizationId, userId, kind: "task.comment", title: `Novo comentário em: ${t.title}`, body: input.body.slice(0, 200), link: `/tarefas/${taskId}`,
    })),
    ...mentioned.map((userId) => ({
      organizationId: ctx.organizationId, userId, kind: "task.mention", title: `Você foi mencionado em: ${t.title}`, body: input.body.slice(0, 200), link: `/tarefas/${taskId}`,
    })),
  ];
  if (msgs.length) await notify(msgs);
}

export async function listTasksForCase(ctx: TenantContext, caseId: string) {
  await assertCaseVisible(ctx, caseId);
  return listTasks(ctx, { caseId, includeClosed: true });
}
