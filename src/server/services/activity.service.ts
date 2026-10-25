import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { addDays, dateToYmd, diffDays, isYmd } from "@/lib/dates/ymd";
import { utcToZoned, zonedToUtc } from "@/lib/dates/zoned";
import { ValidationError } from "@/lib/permissions/check";
import { can, type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";
import { userNames } from "./members";
import { changeTaskStatus } from "./task.service";
import { fulfillDeadline, cancelDeadline } from "./deadline.service";
import { changeEventStatus } from "./agenda.service";

export const ACTIVITY_KINDS = ["TASK", "EVENT", "DEADLINE"] as const;
export type ActivityKind = typeof ACTIVITY_KINDS[number];
export const activityFilterSchema = z.object({ from: z.string().refine(isYmd).optional(), to: z.string().refine(isYmd).optional(), kind: z.enum(ACTIVITY_KINDS).optional(), assigneeId: z.uuid().optional(), q: z.string().trim().max(100).optional(), includeClosed: z.boolean().default(false), caseId: z.uuid().optional(), clientId: z.uuid().optional() }).refine(v => !v.from || !v.to || (v.from <= v.to && diffDays(v.to, v.from) <= 366), "Escolha um intervalo de até 366 dias.");
export type ActivityFilter = z.input<typeof activityFilterSchema>;
export type Activity = { id: string; kind: ActivityKind; title: string; date: string | null; time: string | null; status: "TODO" | "IN_PROGRESS" | "WAITING" | "DONE" | "CANCELED"; originalStatus: string; href: string; assigneeId: string | null; assigneeName: string | null; caseId: string | null; caseTitle: string | null; canWrite: boolean };

/** Projeção dos registros originais: nenhuma cópia de tarefa, prazo ou compromisso é criada. */
export async function listActivities(ctx: TenantContext, raw: ActivityFilter = {}) {
  const f = activityFilterSchema.parse(raw);
  const org = ctx.organizationId;
  const cv: Prisma.CaseWhereInput = { AND: [{ organizationId: org, deletedAt: null }, caseVisibility(ctx)] };
  const visible = { OR: [{ caseId: null }, { case: cv }] };
  const date = { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T00:00:00Z`) } : {}) };
  const common = { organizationId: org, ...(f.caseId ? { caseId: f.caseId } : {}), ...(f.q ? { title: { contains: f.q, mode: "insensitive" as const } } : {}) };
  const clientCase = f.clientId ? { parties: { some: { clientId: f.clientId, organizationId: org } } } : {};
  const clientActivity = f.clientId ? { AND: [{ OR: [{ clientId: f.clientId }, { case: clientCase }] }] } : {};
  const tw: Prisma.TaskWhereInput = { ...common, ...clientActivity, deletedAt: null, ...visible, ...(f.assigneeId ? { assigneeId: f.assigneeId } : {}), ...(!f.includeClosed ? { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } } : {}), ...((f.from || f.to) ? { dueDate: date } : {}) };
  const dw: Prisma.DeadlineWhereInput = { ...common, case: { AND: [cv, clientCase] }, ...(f.assigneeId ? { responsibleId: f.assigneeId } : {}), ...(!f.includeClosed ? { status: { in: ["DRAFT", "VALIDATED"] } } : {}), ...((f.from || f.to) ? { dueDate: date } : {}) };
  const ew: Prisma.AgendaEventWhereInput = { ...common, ...clientActivity, deletedAt: null, ...visible, ...(f.assigneeId ? { assigneeId: f.assigneeId } : {}), ...(!f.includeClosed ? { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } } : {}), ...((f.from || f.to) ? { startsAt: { ...(f.from ? { gte: zonedToUtc(f.from, "00:00", ctx.timezone) } : {}), ...(f.to ? { lt: zonedToUtc(addDays(f.to, 1), "00:00", ctx.timezone) } : {}) } } : {}) };
  const tk = can(ctx, "tasks:read") && (!f.kind || f.kind === "TASK"), dl = can(ctx, "deadlines:read") && (!f.kind || f.kind === "DEADLINE"), ev = (can(ctx, "deadlines:read") || can(ctx, "tasks:read")) && (!f.kind || f.kind === "EVENT");
  const [tasks, deadlines, events, tc, dc, ec] = await Promise.all([
    tk ? db.task.findMany({ where: tw, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }], take: 300, include: { case: { select: { title: true } } } }) : [],
    dl ? db.deadline.findMany({ where: dw, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 300, include: { case: { select: { title: true } } } }) : [],
    ev ? db.agendaEvent.findMany({ where: ew, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 300, include: { case: { select: { title: true } } } }) : [],
    tk ? db.task.count({ where: tw }) : 0, dl ? db.deadline.count({ where: dw }) : 0, ev ? db.agendaEvent.count({ where: ew }) : 0,
  ]);
  const names = await userNames(ctx, [...tasks.map(t => t.assigneeId), ...deadlines.map(d => d.responsibleId), ...events.map(e => e.assigneeId)]);
  const items: Activity[] = [
    ...tasks.map(t => ({ id: t.id, kind: "TASK" as const, title: t.title, date: t.dueDate ? dateToYmd(t.dueDate) : null, time: null, status: t.status, originalStatus: t.status, href: `/tarefas/${t.id}`, assigneeId: t.assigneeId, caseId: t.caseId, caseTitle: t.case?.title ?? null, canWrite: can(ctx, "tasks:write"), assigneeName: t.assigneeId ? names.get(t.assigneeId) ?? null : null })),
    ...deadlines.map(d => ({ id: d.id, kind: "DEADLINE" as const, title: d.title, date: dateToYmd(d.dueDate), time: null, status: (d.status === "DRAFT" ? "TODO" : d.status === "VALIDATED" ? "IN_PROGRESS" : d.status === "FULFILLED" ? "DONE" : "CANCELED") as Activity["status"], originalStatus: d.status, href: `/prazos/${d.id}`, assigneeId: d.responsibleId, caseId: d.caseId, caseTitle: d.case.title, canWrite: can(ctx, "deadlines:write"), assigneeName: d.responsibleId ? names.get(d.responsibleId) ?? null : null })),
    ...events.map(e => { const s = utcToZoned(e.startsAt, ctx.timezone); return { id: e.id, kind: "EVENT" as const, title: e.title, date: s.ymd, time: e.allDay ? null : s.hhmm, status: e.status, originalStatus: e.status, href: `/agenda/${e.id}`, assigneeId: e.assigneeId, caseId: e.caseId, caseTitle: e.case?.title ?? null, canWrite: can(ctx, "deadlines:write") || can(ctx, "tasks:write"), assigneeName: e.assigneeId ? names.get(e.assigneeId) ?? null : null }; }),
  ];
  items.sort((a,b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || (a.time ?? "").localeCompare(b.time ?? "") || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const total = tc + dc + ec;
  return { items: items.slice(0,300), total, truncated: total > 300 };
}

export async function setActivityStatus(ctx: TenantContext, kind: ActivityKind, id: string, raw: string) {
  z.enum(ACTIVITY_KINDS).parse(kind); z.uuid().parse(id);
  const status = z.enum(["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELED"]).parse(raw);
  if (kind === "TASK") return changeTaskStatus(ctx, id, status);
  if (kind === "EVENT") return changeEventStatus(ctx, id, status);
  if (status === "DONE") return fulfillDeadline(ctx, id);
  if (status === "CANCELED") return cancelDeadline(ctx, id);
  throw new ValidationError("Valide o prazo na ficha. O quadro não substitui a validação humana.");
}
