import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { zonedToUtc } from "@/lib/dates/zoned";
import { can, type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";
import { financeSummary } from "./finance.service";

/** Visão de gestão: apenas dados do escritório e processos que a pessoa pode consultar. */
export async function getOfficeOverview(ctx: TenantContext) {
  const org = ctx.organizationId;
  const today = todayYmd(ctx.timezone);
  const start = ymdToDate(today);
  const end7 = ymdToDate(addDays(today, 7));
  const monthStart = zonedToUtc(`${today.slice(0, 7)}-01`, "00:00", ctx.timezone);
  const dayStart = zonedToUtc(today, "00:00", ctx.timezone);
  const agendaEnd = zonedToUtc(addDays(today, 7), "00:00", ctx.timezone);
  const caseWhere: Prisma.CaseWhereInput = { AND: [{ organizationId: org, deletedAt: null }, caseVisibility(ctx)] };
  const portfolioWhere: Prisma.CaseWhereInput = { AND: [caseWhere, { archivedAt: null }] };
  const linked = { OR: [{ caseId: null }, { case: caseWhere }] };
  const taskWhere: Prisma.TaskWhereInput = { organizationId: org, deletedAt: null, ...linked };
  const openTask: Prisma.TaskWhereInput = { ...taskWhere, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } };
  const deadlineWhere: Prisma.DeadlineWhereInput = { organizationId: org, case: caseWhere, status: { in: ["DRAFT", "VALIDATED"] } };
  const canTasks = can(ctx, "tasks:read");
  const canDeadlines = can(ctx, "deadlines:read");
  const canCases = can(ctx, "cases:read");
  const canClients = can(ctx, "clients:read");
  const canTeam = canTasks && can(ctx, "productivity:read") && can(ctx, "members:read");
  const [tasks, overdueTasks, unassignedTasks, completedMonth, deadlines, overdueDeadlines, todayDeadlines, draftDeadlines, nextDeadlines, agenda, cases, newCases, noResponsible, clients, newClients, notices, finance, memberRows, assignments, overdueAssignments] = await Promise.all([
    canTasks ? db.task.groupBy({ by: ["status"], where: taskWhere, _count: { _all: true } }) : null,
    canTasks ? db.task.count({ where: { ...openTask, dueDate: { lt: start } } }) : null,
    canTasks ? db.task.count({ where: { ...openTask, assigneeId: null } }) : null,
    canTasks ? db.task.count({ where: { ...taskWhere, status: "DONE", completedAt: { gte: monthStart, lte: new Date() } } }) : null,
    canDeadlines ? db.deadline.count({ where: deadlineWhere }) : null,
    canDeadlines ? db.deadline.count({ where: { ...deadlineWhere, dueDate: { lt: start } } }) : null,
    canDeadlines ? db.deadline.count({ where: { ...deadlineWhere, dueDate: start } }) : null,
    canDeadlines ? db.deadline.count({ where: { ...deadlineWhere, status: "DRAFT" } }) : null,
    canDeadlines ? db.deadline.findMany({ where: { ...deadlineWhere, dueDate: { lt: end7 } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 5, select: { id: true, title: true, dueDate: true, status: true, case: { select: { title: true } } } }) : null,
    canDeadlines ? db.agendaEvent.findMany({ where: { organizationId: org, deletedAt: null, ...linked, startsAt: { gte: dayStart, lt: agendaEnd } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 5, select: { id: true, title: true, startsAt: true, allDay: true, kind: true, location: true } }) : null,
    canCases ? db.case.groupBy({ by: ["status"], where: portfolioWhere, _count: { _all: true } }) : null,
    canCases ? db.case.count({ where: { AND: [portfolioWhere, { createdAt: { gte: monthStart, lte: new Date() } }] } }) : null,
    canCases ? db.case.count({ where: { AND: [portfolioWhere, { status: "ACTIVE", members: { none: { role: "RESPONSIBLE" } } }] } }) : null,
    canClients ? db.client.count({ where: { organizationId: org, deletedAt: null, status: "ACTIVE" } }) : null,
    canClients ? db.client.count({ where: { organizationId: org, deletedAt: null, createdAt: { gte: monthStart, lte: new Date() } } }) : null,
    can(ctx, "inbox:read") ? db.courtNotice.groupBy({ by: ["status"], where: { organizationId: org, deletedAt: null, ...linked, status: { in: ["NEW", "DISTRIBUTED"] } }, _count: { _all: true } }) : null,
    can(ctx, "finance:read") ? financeSummary(ctx) : null,
    canTeam ? db.membership.findMany({ where: { organizationId: org, status: "ACTIVE" }, select: { user: { select: { id: true, name: true } } } }) : null,
    canTeam ? db.task.groupBy({ by: ["assigneeId"], where: openTask, _count: { _all: true } }) : [],
    canTeam ? db.task.groupBy({ by: ["assigneeId"], where: { ...openTask, dueDate: { lt: start } }, _count: { _all: true } }) : [],
  ]);
  const taskCount = (s: string) => tasks?.find(g => g.status === s)?._count._all ?? 0;
  return {
    today,
    clients: clients === null ? null : { active: clients, newMonth: newClients ?? 0 },
    portfolio: cases === null ? null : { statuses: cases.map(g => ({ status: g.status, count: g._count._all })), newMonth: newCases ?? 0, unassigned: noResponsible ?? 0 },
    tasks: tasks === null ? null : { open: taskCount("TODO") + taskCount("IN_PROGRESS") + taskCount("WAITING"), overdue: overdueTasks ?? 0, unassigned: unassignedTasks ?? 0, completedMonth: completedMonth ?? 0, todo: taskCount("TODO"), inProgress: taskCount("IN_PROGRESS"), waiting: taskCount("WAITING") },
    deadlines: deadlines === null ? null : { open: deadlines, overdue: overdueDeadlines ?? 0, today: todayDeadlines ?? 0, draft: draftDeadlines ?? 0, items: nextDeadlines ?? [] },
    agenda,
    notices: notices === null ? null : { new: notices.find(g => g.status === "NEW")?._count._all ?? 0, distributed: notices.find(g => g.status === "DISTRIBUTED")?._count._all ?? 0 },
    finance,
    team: memberRows === null ? null : memberRows.map(({ user }) => ({ ...user, open: assignments.find(g => g.assigneeId === user.id)?._count._all ?? 0, overdue: overdueAssignments.find(g => g.assigneeId === user.id)?._count._all ?? 0 })).sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name)),
  };
}
