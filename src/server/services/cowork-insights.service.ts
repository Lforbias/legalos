import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { addDays, diffDays, isYmd, todayYmd } from "@/lib/dates/ymd";
import { zonedToUtc } from "@/lib/dates/zoned";
import { assertCan, can, type TenantContext } from "@/server/context";
import { COWORK_DEPARTMENT_LABEL, isCoworkDepartment, type WorkState } from "@/modules/cowork/constants";
import { caseVisibility } from "./case.service";
import { assertCoworkAccess, coworkUserWhere } from "./cowork-access.service";
import { usersInMeetingNow } from "./cowork-meeting.service";
import { taskVisibility } from "./task.service";

/**
 * Estado de trabalho de cada pessoa, a partir de evidências reais (nunca de "estar online"):
 * - Em reunião: participante com presença registrada em reunião em andamento;
 * - Em andamento: tem tarefa ou compromisso em andamento;
 * - Aguardando: tem tarefa aguardando (e nenhuma em andamento);
 * - Concluído: concluiu tarefa hoje e não tem nada em andamento/aguardando;
 * - Não informado: nenhum dos casos acima.
 * O estado não revela qual tarefa é (nem seu processo), só a situação.
 */
export async function computeWorkStates(ctx: TenantContext, userIds: string[]): Promise<Map<string, WorkState>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, WorkState>(ids.map((id) => [id, "NOT_INFORMED"]));
  if (!ids.length) return out;
  const startToday = zonedToUtc(todayYmd(ctx.timezone), "00:00", ctx.timezone);
  const [inMeeting, tasks, events, doneToday] = await Promise.all([
    usersInMeetingNow(ctx.organizationId),
    db.task.groupBy({ by: ["assigneeId", "status"], where: { organizationId: ctx.organizationId, deletedAt: null, assigneeId: { in: ids }, status: { in: ["IN_PROGRESS", "WAITING"] } }, _count: { _all: true } }),
    db.agendaEvent.groupBy({ by: ["assigneeId"], where: { organizationId: ctx.organizationId, deletedAt: null, assigneeId: { in: ids }, status: "IN_PROGRESS" }, _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { organizationId: ctx.organizationId, deletedAt: null, assigneeId: { in: ids }, status: "DONE", completedAt: { gte: startToday } }, _count: { _all: true } }),
  ]);
  for (const d of doneToday) if (d.assigneeId) out.set(d.assigneeId, "DONE");
  for (const t of tasks) if (t.assigneeId && t.status === "WAITING") out.set(t.assigneeId, "WAITING");
  for (const t of tasks) if (t.assigneeId && t.status === "IN_PROGRESS") out.set(t.assigneeId, "IN_PROGRESS");
  for (const e of events) if (e.assigneeId) out.set(e.assigneeId, "IN_PROGRESS");
  for (const id of ids) if (inMeeting.has(id)) out.set(id, "IN_MEETING");
  return out;
}

export async function listWorkStates(ctx: TenantContext, userIds: string[]) {
  await assertCoworkAccess(ctx);
  return Object.fromEntries(await computeWorkStates(ctx, userIds));
}

export const insightsFilterSchema = z
  .object({
    from: z.string().refine(isYmd).optional(),
    to: z.string().refine(isYmd).optional(),
    userId: z.uuid().optional(),
    teamId: z.uuid().optional(),
    department: z.string().optional(),
    caseId: z.uuid().optional(),
    status: z.enum(["TODO", "IN_PROGRESS", "WAITING", "DONE", "OVERDUE"]).optional(),
  })
  .refine((v) => !v.from || !v.to || (v.from <= v.to && diffDays(v.to, v.from) <= 366), "Escolha um intervalo de até 366 dias.");
export type InsightsFilter = z.input<typeof insightsFilterSchema>;

/**
 * Painel de acompanhamento do trabalho. Usa só dados verificáveis dos módulos originais (tarefas, horas apontadas,
 * agenda e reuniões). NÃO lê nem conta mensagens: o conteúdo das conversas e das mensagens diretas fica fora do painel.
 * Tarefas de processos sigilosos que o gestor não enxerga ficam fora dos números (mesma regra do módulo de tarefas).
 */
export async function getInsights(ctx: TenantContext, raw: InsightsFilter = {}) {
  await assertCoworkAccess(ctx);
  assertCan(ctx, "cowork:insights");
  const f = insightsFilterSchema.parse(raw);
  const today = todayYmd(ctx.timezone);
  const to = f.to ?? today;
  const from = f.from ?? addDays(to, -29);
  const fromUtc = zonedToUtc(from, "00:00", ctx.timezone);
  const toUtc = zonedToUtc(addDays(to, 1), "00:00", ctx.timezone);
  const org = ctx.organizationId;

  const peopleWhere: Prisma.UserWhereInput[] = [coworkUserWhere(org)];
  if (f.userId) peopleWhere.push({ id: f.userId });
  if (f.teamId) {
    const members = await db.workTeamMember.findMany({ where: { teamId: f.teamId, organizationId: org }, select: { userId: true } });
    peopleWhere.push({ id: { in: members.map((m) => m.userId) } });
  }
  if (f.department && isCoworkDepartment(f.department)) peopleWhere.push({ coworkProfiles: { some: { organizationId: org, department: f.department } } });
  const people = await db.user.findMany({
    where: { AND: peopleWhere },
    orderBy: { name: "asc" },
    take: 500,
    select: { id: true, name: true, coworkProfiles: { where: { organizationId: org }, select: { displayName: true, department: true, jobTitle: true } } },
  });
  const ids = people.map((p) => p.id);

  const visibleCase: Prisma.CaseWhereInput = { AND: [{ deletedAt: null }, caseVisibility(ctx)] };
  const taskBase: Prisma.TaskWhereInput = { AND: [{ organizationId: org, deletedAt: null, assigneeId: { in: ids } }, taskVisibility(ctx), ...(f.caseId ? [{ caseId: f.caseId }] : [])] };
  const overdueWhere: Prisma.TaskWhereInput = { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, dueDate: { lt: new Date(`${today}T00:00:00Z`) } };
  const statusFilter: Prisma.TaskWhereInput | null = f.status === "OVERDUE" ? overdueWhere : f.status === "DONE" ? { status: "DONE", completedAt: { gte: fromUtc, lt: toUtc } } : f.status ? { status: f.status } : null;

  const canHours = can(ctx, "productivity:read");
  const [open, done, overdue, hours, meetings, fromCowork, overdueList, waitingList, teams, states] = await Promise.all([
    db.task.groupBy({ by: ["assigneeId", "status"], where: { AND: [taskBase, { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } }] }, _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { AND: [taskBase, { status: "DONE", completedAt: { gte: fromUtc, lt: toUtc } }] }, _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { AND: [taskBase, overdueWhere] }, _count: { _all: true } }),
    canHours
      ? db.timeEntry.groupBy({ by: ["userId"], where: { organizationId: org, deletedAt: null, userId: { in: ids }, entryDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }, ...(f.caseId ? { caseId: f.caseId } : {}), OR: [{ caseId: null }, { caseId: { in: (await db.case.findMany({ where: { AND: [{ organizationId: org }, visibleCase] }, select: { id: true } })).map((c) => c.id) } }] }, _sum: { minutes: true } })
      : Promise.resolve([] as { userId: string; _sum: { minutes: number | null } }[]),
    db.coworkMeetingParticipant.groupBy({ by: ["userId"], where: { organizationId: org, userId: { in: ids }, meeting: { startsAt: { gte: fromUtc, lt: toUtc }, status: { not: "CANCELED" }, ...(f.caseId ? { caseId: f.caseId } : {}) } }, _count: { _all: true } }),
    db.coworkWorkItem.findMany({ where: { organizationId: org, createdAt: { gte: fromUtc, lt: toUtc }, task: { is: { AND: [taskBase] } } }, select: { task: { select: { assigneeId: true } } } }),
    db.task.findMany({ where: { AND: [taskBase, overdueWhere, ...(statusFilter ? [statusFilter] : [])] }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 50, select: { id: true, title: true, dueDate: true, status: true, assigneeId: true, case: { select: { id: true, title: true } } } }),
    db.task.findMany({ where: { AND: [taskBase, { status: "WAITING" }, ...(statusFilter && f.status !== "WAITING" ? [statusFilter] : [])] }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 50, select: { id: true, title: true, dueDate: true, status: true, assigneeId: true, case: { select: { id: true, title: true } } } }),
    db.workTeam.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    computeWorkStates(ctx, ids),
  ]);

  const count = (rows: { assigneeId: string | null; _count: { _all: number } }[], id: string) => rows.filter((r) => r.assigneeId === id).reduce((n, r) => n + r._count._all, 0);
  const rows = people.map((p) => {
    const prof = p.coworkProfiles[0];
    const dept = isCoworkDepartment(prof?.department) ? prof.department : null;
    const o = open.filter((r) => r.assigneeId === p.id);
    const by = (s: string) => o.filter((r) => r.status === s).reduce((n, r) => n + r._count._all, 0);
    return {
      userId: p.id,
      name: prof?.displayName?.trim() || p.name,
      jobTitle: prof?.jobTitle ?? null,
      department: dept,
      departmentLabel: dept ? COWORK_DEPARTMENT_LABEL[dept] : "Sem departamento",
      todo: by("TODO"),
      inProgress: by("IN_PROGRESS"),
      waiting: by("WAITING"),
      done: count(done, p.id),
      overdue: count(overdue, p.id),
      minutes: canHours ? (hours.find((h) => h.userId === p.id)?._sum.minutes ?? 0) : null,
      meetings: meetings.find((m) => m.userId === p.id)?._count._all ?? 0,
      fromCowork: fromCowork.filter((w) => w.task?.assigneeId === p.id).length,
      state: states.get(p.id) ?? "NOT_INFORMED",
    };
  });
  const filteredRows = f.status ? rows.filter((r) => (f.status === "OVERDUE" ? r.overdue : f.status === "DONE" ? r.done : f.status === "TODO" ? r.todo : f.status === "IN_PROGRESS" ? r.inProgress : r.waiting) > 0) : rows;
  const byDept = new Map<string, { label: string; people: number; open: number; overdue: number; done: number }>();
  for (const r of filteredRows) {
    const k = r.department ?? "none";
    const d = byDept.get(k) ?? { label: r.departmentLabel, people: 0, open: 0, overdue: 0, done: 0 };
    d.people++;
    d.open += r.todo + r.inProgress + r.waiting;
    d.overdue += r.overdue;
    d.done += r.done;
    byDept.set(k, d);
  }
  const names = new Map(rows.map((r) => [r.userId, r.name]));
  const mapTask = (t: (typeof overdueList)[number]) => ({ id: t.id, title: t.title, dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null, status: t.status, assigneeName: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null, case: t.case });
  const totals = filteredRows.reduce((a, r) => ({ open: a.open + r.todo + r.inProgress + r.waiting, inProgress: a.inProgress + r.inProgress, waiting: a.waiting + r.waiting, done: a.done + r.done, overdue: a.overdue + r.overdue, minutes: a.minutes + (r.minutes ?? 0), meetings: a.meetings + r.meetings }), { open: 0, inProgress: 0, waiting: 0, done: 0, overdue: 0, minutes: 0, meetings: 0 });
  return { from, to, canHours, rows: filteredRows, totals, departments: [...byDept.values()], overdue: overdueList.map(mapTask), waiting: waitingList.map(mapTask), teams };
}
