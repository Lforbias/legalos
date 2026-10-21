import { db } from "@/lib/db/client";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { parseDuration, timeEntrySchema, type TimeEntryInput } from "@/modules/timesheet/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility } from "./case.service";

/** Registra horas do PRÓPRIO usuário (quem tem permissão de escrever tarefas). */
export async function logTime(ctx: TenantContext, raw: TimeEntryInput) {
  assertCan(ctx, "tasks:write");
  const i = timeEntrySchema.parse(raw);
  if (i.caseId) await assertCaseVisible(ctx, i.caseId);
  return db.$transaction(async (tx) => {
    const e = await tx.timeEntry.create({
      data: { organizationId: ctx.organizationId, userId: ctx.userId, caseId: i.caseId || null, entryDate: new Date(`${i.date}T00:00:00Z`), minutes: parseDuration(i.duration)!, description: i.description },
    });
    await audit({ action: "time.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "time_entry", resourceId: e.id, metadata: { minutes: e.minutes }, meta: ctx.meta }, tx);
    return e;
  });
}

export async function deleteTime(ctx: TenantContext, id: string) {
  assertCan(ctx, "tasks:write");
  const r = await db.timeEntry.updateMany({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (r.count === 0) throw new NotFoundError("Lançamento não encontrado.");
  await audit({ action: "time.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "time_entry", resourceId: id, meta: ctx.meta });
}

export async function listMyTime(ctx: TenantContext, days = 30) {
  assertCan(ctx, "tasks:read");
  const since = new Date(`${addDays(todayYmd(ctx.timezone), -(days - 1))}T00:00:00Z`);
  const rows = await db.timeEntry.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId, deletedAt: null, entryDate: { gte: since } },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const caseIds = [...new Set(rows.map((r) => r.caseId).filter((x): x is string => !!x))];
  const cases = caseIds.length
    ? await db.case.findMany({ where: { AND: [{ id: { in: caseIds }, organizationId: ctx.organizationId }, caseVisibility(ctx)] }, select: { id: true, title: true } })
    : [];
  const titles = new Map(cases.map((c) => [c.id, c.title]));
  return rows.map((r) => ({ ...r, caseTitle: r.caseId ? (titles.get(r.caseId) ?? null) : null }));
}

export type MemberWorkload = {
  userId: string;
  name: string;
  roleName: string;
  openTasks: number;
  overdueTasks: number;
  openDeadlines: number;
  overdueDeadlines: number;
  draftDeadlines: number;
  next7Deadlines: number;
  minutes: number;
};

/** Carga de trabalho por membro ativo. Respeita o sigilo de processos (itens ocultos ao observador não entram na contagem). */
export async function teamWorkload(ctx: TenantContext, days = 30): Promise<{ members: MemberWorkload[]; days: number; unassigned: { tasks: number; deadlines: number } }> {
  assertCan(ctx, "productivity:read");
  const org = ctx.organizationId;
  const today = new Date(`${todayYmd(ctx.timezone)}T00:00:00Z`);
  const in7 = new Date(today.getTime() + 7 * 86_400_000);
  const since = new Date(today.getTime() - (days - 1) * 86_400_000);
  const vis = { AND: [{ deletedAt: null }, caseVisibility(ctx)] };
  const taskWhere = { organizationId: org, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] as ("TODO" | "IN_PROGRESS" | "WAITING")[] }, OR: [{ caseId: null }, { case: vis }] };
  const dlWhere = { organizationId: org, status: { in: ["DRAFT", "VALIDATED"] as ("DRAFT" | "VALIDATED")[] }, case: vis };

  const [members, tasks, tasksLate, dls, dlsLate, dlsDraft, dls7, hours, unTasks, unDls] = await Promise.all([
    db.membership.findMany({ where: { organizationId: org, status: "ACTIVE" }, select: { user: { select: { id: true, name: true } }, role: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
    db.task.groupBy({ by: ["assigneeId"], where: taskWhere, _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { ...taskWhere, dueDate: { lt: today } }, _count: { _all: true } }),
    db.deadline.groupBy({ by: ["responsibleId"], where: dlWhere, _count: { _all: true } }),
    db.deadline.groupBy({ by: ["responsibleId"], where: { ...dlWhere, dueDate: { lt: today } }, _count: { _all: true } }),
    db.deadline.groupBy({ by: ["responsibleId"], where: { ...dlWhere, status: "DRAFT" }, _count: { _all: true } }),
    db.deadline.groupBy({ by: ["responsibleId"], where: { ...dlWhere, dueDate: { gte: today, lte: in7 } }, _count: { _all: true } }),
    db.timeEntry.groupBy({ by: ["userId"], where: { organizationId: org, deletedAt: null, entryDate: { gte: since } }, _sum: { minutes: true } }),
    db.task.count({ where: { ...taskWhere, assigneeId: null } }),
    db.deadline.count({ where: { ...dlWhere, responsibleId: null } }),
  ]);
  const n = <K extends string>(rows: ({ _count: { _all: number } } & Record<K, string | null>)[], key: K, id: string) => rows.find((r) => r[key] === id)?._count._all ?? 0;
  return {
    days,
    unassigned: { tasks: unTasks, deadlines: unDls },
    members: members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      roleName: m.role.name,
      openTasks: n(tasks, "assigneeId", m.user.id),
      overdueTasks: n(tasksLate, "assigneeId", m.user.id),
      openDeadlines: n(dls, "responsibleId", m.user.id),
      overdueDeadlines: n(dlsLate, "responsibleId", m.user.id),
      draftDeadlines: n(dlsDraft, "responsibleId", m.user.id),
      next7Deadlines: n(dls7, "responsibleId", m.user.id),
      minutes: hours.find((h) => h.userId === m.user.id)?._sum.minutes ?? 0,
    })),
  };
}
