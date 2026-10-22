import { db } from "@/lib/db/client";
import { todayYmd } from "@/lib/dates/ymd";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { caseVisibility } from "./case.service";
import { getTask, updateTask } from "./task.service";

/**
 * 5.0-F6 — metas mensais e carga de trabalho por peso.
 * Peso de uma tarefa = pontos do tipo de tarefa (Configurações → Tipos de tarefa; sem tipo = 1 ponto). Nada é estimado: só conta o que está cadastrado.
 * A distribuição é SUGESTÃO: a pessoa confere e confirma; só então o responsável muda (com histórico e aviso ao novo responsável).
 */

export const GOAL_METRICS = {
  TASKS_DONE: { label: "Tarefas concluídas", unit: "tarefas" },
  POINTS_DONE: { label: "Pontos concluídos", unit: "pontos" },
  DEADLINES_DONE: { label: "Prazos cumpridos", unit: "prazos" },
  HOURS: { label: "Horas registradas", unit: "h" },
} as const;
export type GoalMetric = keyof typeof GOAL_METRICS;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Início do mês no fuso do escritório, como instante UTC. */
function zonedMonthStart(month: string, tz: string): Date {
  const guess = new Date(`${month}-01T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asLocal = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
export const currentMonth = (tz: string) => todayYmd(tz).slice(0, 7);

export async function setGoal(ctx: TenantContext, input: { userId?: string | null; month: string; metric: string; target: number }) {
  assertCan(ctx, "organization:manage");
  if (!MONTH.test(input.month)) throw new ValidationError("Mês inválido.", { month: ["Mês inválido."] });
  if (!(input.metric in GOAL_METRICS)) throw new ValidationError("Escolha a medida da meta.", { metric: ["Escolha a medida da meta."] });
  if (!Number.isFinite(input.target) || input.target <= 0 || input.target > 100_000) throw new ValidationError("A meta deve ser um número maior que zero.", { target: ["Informe um número maior que zero."] });
  if (input.userId) {
    const m = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: input.userId, status: "ACTIVE" }, select: { id: true } });
    if (!m) throw new NotFoundError("Pessoa não encontrada na equipe.");
  }
  const userId = input.userId || null;
  const existing = await db.workGoal.findFirst({ where: { organizationId: ctx.organizationId, userId, month: input.month, metric: input.metric } });
  const g = existing
    ? await db.workGoal.update({ where: { id: existing.id }, data: { target: input.target } })
    : await db.workGoal.create({ data: { organizationId: ctx.organizationId, userId, month: input.month, metric: input.metric, target: input.target, createdById: ctx.userId } });
  await audit({ action: "goal.set", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "work_goal", resourceId: g.id, metadata: { month: input.month, metric: input.metric, target: input.target, userId }, meta: ctx.meta });
  return { id: g.id };
}

export async function deleteGoal(ctx: TenantContext, id: string) {
  assertCan(ctx, "organization:manage");
  const r = await db.workGoal.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count === 0) throw new NotFoundError("Meta não encontrada.");
  await audit({ action: "goal.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "work_goal", resourceId: id, meta: ctx.meta });
}

async function actualFor(ctx: TenantContext, month: string, userIds: string[]) {
  const from = zonedMonthStart(month, ctx.timezone);
  const to = zonedMonthStart(nextMonth(month), ctx.timezone);
  const vis = { AND: [{ deletedAt: null }, caseVisibility(ctx)] };
  const done = await db.task.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, status: "DONE", completedAt: { gte: from, lt: to }, assigneeId: { in: userIds }, OR: [{ caseId: null }, { case: vis }] },
    select: { assigneeId: true, type: { select: { points: true } } },
  });
  const dls = await db.deadline.groupBy({ by: ["responsibleId"], where: { organizationId: ctx.organizationId, status: "FULFILLED", fulfilledAt: { gte: from, lt: to }, responsibleId: { in: userIds }, case: vis }, _count: { _all: true } });
  const hrs = await db.timeEntry.groupBy({ by: ["userId"], where: { organizationId: ctx.organizationId, deletedAt: null, userId: { in: userIds }, entryDate: { gte: new Date(`${month}-01T00:00:00Z`), lt: new Date(`${nextMonth(month)}-01T00:00:00Z`) } }, _sum: { minutes: true } });
  const out = new Map<string, Record<GoalMetric, number>>();
  for (const u of userIds) out.set(u, { TASKS_DONE: 0, POINTS_DONE: 0, DEADLINES_DONE: 0, HOURS: 0 });
  for (const t of done) {
    const o = out.get(t.assigneeId!)!;
    o.TASKS_DONE += 1;
    o.POINTS_DONE += t.type?.points ?? 1;
  }
  for (const d of dls) if (d.responsibleId) out.get(d.responsibleId)!.DEADLINES_DONE = d._count._all;
  for (const h of hrs) out.get(h.userId)!.HOURS = Math.round(((h._sum.minutes ?? 0) / 60) * 10) / 10;
  return out;
}

export type GoalRow = { id: string; userId: string | null; name: string; metric: GoalMetric; target: number; actual: number; pct: number };

/** Progresso do mês: metas por pessoa e metas da equipe (user_id nulo = soma de todos). */
export async function goalProgress(ctx: TenantContext, month: string): Promise<{ month: string; rows: GoalRow[]; members: { id: string; name: string }[] }> {
  assertCan(ctx, "productivity:read");
  if (!MONTH.test(month)) throw new ValidationError("Mês inválido.");
  const members = (await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } })).map((m) => m.user);
  const goals = await db.workGoal.findMany({ where: { organizationId: ctx.organizationId, month }, orderBy: { createdAt: "asc" } });
  const actual = await actualFor(ctx, month, members.map((m) => m.id));
  const names = new Map(members.map((m) => [m.id, m.name]));
  const rows = goals.map((g): GoalRow => {
    const metric = g.metric as GoalMetric;
    const target = Number(g.target);
    const value = g.userId ? (actual.get(g.userId)?.[metric] ?? 0) : [...actual.values()].reduce((s, a) => s + a[metric], 0);
    return { id: g.id, userId: g.userId, name: g.userId ? (names.get(g.userId) ?? "Ex-membro") : "Equipe toda", metric, target, actual: Math.round(value * 10) / 10, pct: Math.round((value / target) * 100) };
  });
  return { month, rows, members };
}

export type WeightedLoad = { userId: string; name: string; openTasks: number; points: number };

async function openTaskWeights(ctx: TenantContext) {
  const vis = { AND: [{ deletedAt: null }, caseVisibility(ctx)] };
  const rows = await db.task.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, OR: [{ caseId: null }, { case: vis }] },
    select: { id: true, title: true, assigneeId: true, priority: true, dueDate: true, type: { select: { points: true } } },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, assigneeId: r.assigneeId, priority: r.priority, dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null, points: r.type?.points ?? 1 }));
}

export async function weightedWorkload(ctx: TenantContext): Promise<{ members: WeightedLoad[]; unassigned: { count: number; points: number } }> {
  assertCan(ctx, "productivity:read");
  const [members, tasks] = await Promise.all([
    db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
    openTaskWeights(ctx),
  ]);
  const out = members.map((m) => {
    const mine = tasks.filter((t) => t.assigneeId === m.user.id);
    return { userId: m.user.id, name: m.user.name, openTasks: mine.length, points: mine.reduce((s, t) => s + t.points, 0) };
  });
  const un = tasks.filter((t) => !t.assigneeId);
  return { members: out, unassigned: { count: un.length, points: un.reduce((s, t) => s + t.points, 0) } };
}

export type Suggestion = { taskId: string; title: string; points: number; userId: string; userName: string };

/** Distribui as tarefas SEM responsável: das mais pesadas para as mais leves, sempre para quem tem menos pontos no momento. Só sugere. */
export async function suggestDistribution(ctx: TenantContext, opts: { userIds?: string[] } = {}): Promise<Suggestion[]> {
  assertCan(ctx, "productivity:read");
  const [load, tasks] = await Promise.all([weightedWorkload(ctx), openTaskWeights(ctx)]);
  let pool = load.members.map((m) => ({ ...m }));
  if (opts.userIds?.length) pool = pool.filter((m) => opts.userIds!.includes(m.userId));
  if (!pool.length) return [];
  const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
  const un = tasks.filter((t) => !t.assigneeId).sort((a, b) => b.points - a.points || rank[a.priority] - rank[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id.localeCompare(b.id));
  const out: Suggestion[] = [];
  for (const t of un.slice(0, 100)) {
    pool.sort((a, b) => a.points - b.points || a.name.localeCompare(b.name, "pt-BR"));
    const pick = pool[0]!;
    pick.points += t.points;
    out.push({ taskId: t.id, title: t.title, points: t.points, userId: pick.userId, userName: pick.name });
  }
  return out;
}

/** Aplica as atribuições que uma pessoa confirmou. Cada tarefa só muda se continuar sem responsável. */
export async function applyDistribution(ctx: TenantContext, items: { taskId: string; userId: string }[]): Promise<{ applied: number; skipped: number }> {
  assertCan(ctx, "productivity:read");
  assertCan(ctx, "tasks:write");
  if (items.length > 100) throw new ValidationError("No máximo 100 tarefas por vez.");
  const valid = new Set((await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, select: { userId: true } })).map((m) => m.userId));
  let applied = 0;
  let skipped = 0;
  for (const it of items) {
    if (!valid.has(it.userId)) { skipped++; continue; }
    const t = await getTask(ctx, it.taskId).catch(() => null);
    if (!t || t.assigneeId || !["TODO", "IN_PROGRESS", "WAITING"].includes(t.status)) { skipped++; continue; }
    await updateTask(ctx, it.taskId, { title: t.title, description: t.description ?? "", status: t.status, priority: t.priority, dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "", assigneeId: it.userId, caseId: t.caseId ?? "", clientId: t.clientId ?? "" });
    applied++;
  }
  await audit({ action: "goal.distribute", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: { applied, skipped }, meta: ctx.meta });
  return { applied, skipped };
}
