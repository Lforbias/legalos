import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { calculateDeadline } from "@/lib/deadlines/calculator";
import { dateToYmd, todayYmd } from "@/lib/dates/ymd";
import { ConflictError, NotFoundError } from "@/lib/permissions/check";
import { calcSchema, deadlineSchema, toDeadlineData, type CalcInput, type DeadlineInput } from "@/modules/deadlines/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { emitWebhookEvent } from "./webhook.service";
import { audit } from "./audit.service";
import { assertActiveMember, assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";
import { userNames } from "./members";
import { assertNoticeUsable } from "./notice-guard";
import { runWorkflows } from "./workflow.service";
import { notify } from "./notification.service";

type Status = (typeof import("@/modules/deadlines/schemas").DEADLINE_STATUSES)[number];

export type DeadlineFilters = { status?: Status; caseId?: string; responsibleId?: string; overdue?: boolean; from?: string; to?: string; includeClosed?: boolean };

/** Cálculo AUXILIAR: nunca define o prazo; o resultado precisa ser conferido e validado por um humano. */
export function calculateAuxiliary(ctx: TenantContext, raw: CalcInput) {
  assertCan(ctx, "deadlines:read");
  const i = calcSchema.parse(raw);
  return calculateDeadline({ startDate: i.startDate, days: Number(i.days), countType: i.countType });
}

export async function listDeadlines(ctx: TenantContext, f: DeadlineFilters = {}) {
  assertCan(ctx, "deadlines:read");
  const and: Prisma.DeadlineWhereInput[] = [{ organizationId: ctx.organizationId }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }];
  if (f.status) and.push({ status: f.status });
  else if (!f.includeClosed) and.push({ status: { in: ["DRAFT", "VALIDATED"] } });
  if (f.caseId) and.push({ caseId: f.caseId });
  if (f.responsibleId) and.push({ responsibleId: f.responsibleId });
  if (f.overdue) and.push({ status: { in: ["DRAFT", "VALIDATED"] }, dueDate: { lt: new Date(`${todayYmd(ctx.timezone)}T00:00:00Z`) } });
  if (f.from) and.push({ dueDate: { gte: new Date(`${f.from}T00:00:00Z`) } });
  if (f.to) and.push({ dueDate: { lte: new Date(`${f.to}T00:00:00Z`) } });
  const where: Prisma.DeadlineWhereInput = { AND: and };
  const [total, rows] = await Promise.all([
    db.deadline.count({ where }),
    db.deadline.findMany({ where, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 300, include: { case: { select: { id: true, title: true, number: true } } } }),
  ]);
  const names = await userNames(ctx, rows.map((r) => r.responsibleId));
  return { total, truncated: total > rows.length, items: rows.map((r) => ({ ...r, responsibleName: r.responsibleId ? (names.get(r.responsibleId) ?? null) : null })) };
}

export async function getDeadline(ctx: TenantContext, id: string) {
  assertCan(ctx, "deadlines:read");
  const d = await db.deadline.findFirst({
    where: { id, organizationId: ctx.organizationId, case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } },
    include: { case: { select: { id: true, title: true, number: true } } },
  });
  if (!d) throw new NotFoundError("Prazo não encontrado.");
  const names = await userNames(ctx, [d.responsibleId, d.validatedById, d.createdById]);
  const n = (x: string | null) => (x ? (names.get(x) ?? null) : null);
  return { ...d, responsibleName: n(d.responsibleId), validatedByName: n(d.validatedById), createdByName: n(d.createdById) };
}

export async function createDeadline(ctx: TenantContext, raw: DeadlineInput, opts: { sourceNoticeId?: string } = {}) {
  assertCan(ctx, "deadlines:write");
  const data = toDeadlineData(deadlineSchema.parse(raw));
  await assertCaseVisible(ctx, data.caseId);
  if (data.responsibleId) await assertActiveMember(ctx, data.responsibleId);
  if (opts.sourceNoticeId) await assertNoticeUsable(ctx, opts.sourceNoticeId);
  const created = await db.$transaction(async (tx) => {
    // todo prazo nasce como RASCUNHO: só vale como definitivo após validação humana
    const d = await tx.deadline.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId, status: "DRAFT", source: "MANUAL", sourceNoticeId: opts.sourceNoticeId ?? null } });
    await logCaseEvent(tx, ctx, d.caseId, { kind: "DEADLINE_CREATED", title: `Prazo cadastrado (aguardando validação): ${d.title}`, description: `Data fatal: ${dateToYmd(d.dueDate).split("-").reverse().join("/")}.` });
    await audit({ action: "deadline.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "deadline", resourceId: d.id, meta: ctx.meta }, tx);
    return d;
  });
  await emitWebhookEvent(ctx.organizationId, "deadline.created", { deadlineId: created.id, caseId: created.caseId, dueDate: dateToYmd(created.dueDate) });
  return created;
}

export async function updateDeadline(ctx: TenantContext, id: string, raw: DeadlineInput) {
  assertCan(ctx, "deadlines:write");
  const data = toDeadlineData(deadlineSchema.parse(raw));
  const cur = await getDeadline(ctx, id);
  if (cur.status === "FULFILLED" || cur.status === "CANCELED") throw new ConflictError("Prazos cumpridos ou cancelados não podem ser editados.");
  if (data.caseId !== cur.caseId) await assertCaseVisible(ctx, data.caseId);
  if (data.responsibleId) await assertActiveMember(ctx, data.responsibleId);
  const datesChanged = dateToYmd(data.dueDate) !== dateToYmd(cur.dueDate);
  // mudar a data fatal invalida a validação anterior: precisa ser validado de novo
  const revalidate = cur.status === "VALIDATED" && datesChanged;
  await db.$transaction(async (tx) => {
    await tx.deadline.update({
      where: { id },
      data: { ...data, ...(revalidate ? { status: "DRAFT", validatedById: null, validatedAt: null } : {}) },
    });
    if (datesChanged) await logCaseEvent(tx, ctx, data.caseId, { kind: "DEADLINE_UPDATED", title: `Data do prazo alterada: ${data.title}`, description: revalidate ? "A validação anterior foi desfeita; é preciso validar novamente." : null });
    await audit({ action: "deadline.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "deadline", resourceId: id, metadata: { datesChanged, revalidate }, meta: ctx.meta }, tx);
  });
  return { revalidate };
}

async function transition(ctx: TenantContext, id: string, from: Status[], to: Status, action: string, extra: Prisma.DeadlineUncheckedUpdateInput, eventTitle: string) {
  const cur = await getDeadline(ctx, id);
  if (!from.includes(cur.status)) throw new ConflictError("Esta ação não é possível no estado atual do prazo.");
  await db.$transaction(async (tx) => {
    // updateMany com o estado esperado protege contra duas ações simultâneas
    const r = await tx.deadline.updateMany({ where: { id, organizationId: ctx.organizationId, status: cur.status }, data: { status: to, ...extra } });
    if (r.count !== 1) throw new ConflictError("O prazo foi alterado por outra pessoa. Recarregue a página.");
    await logCaseEvent(tx, ctx, cur.caseId, { kind: action.replace(".", "_").toUpperCase(), title: `${eventTitle}: ${cur.title}` });
    await audit({ action, organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "deadline", resourceId: id, metadata: { from: cur.status, to }, meta: ctx.meta }, tx);
  });
  return cur;
}

/** Validação humana: transforma o rascunho em prazo definitivo. Exige permissão específica. */
export async function validateDeadline(ctx: TenantContext, id: string) {
  assertCan(ctx, "deadlines:validate");
  const cur = await transition(ctx, id, ["DRAFT"], "VALIDATED", "deadline.validate", { validatedById: ctx.userId, validatedAt: new Date() }, "Prazo validado");
  if (cur.responsibleId && cur.responsibleId !== ctx.userId) {
    await notify({ organizationId: ctx.organizationId, userId: cur.responsibleId, kind: "deadline.validated", title: `Prazo validado: ${cur.title}`, link: `/prazos/${id}`, dedupeKey: `deadline-validated:${id}:${dateToYmd(cur.dueDate)}` });
  }
  await runWorkflows(ctx, "DEADLINE_VALIDATED", { type: "deadline", id, userId: ctx.userId, label: cur.title, baseDate: dateToYmd(cur.dueDate), caseId: cur.caseId });
}

export async function fulfillDeadline(ctx: TenantContext, id: string) {
  assertCan(ctx, "deadlines:write");
  await transition(ctx, id, ["VALIDATED"], "FULFILLED", "deadline.fulfill", { fulfilledAt: new Date() }, "Prazo cumprido");
}

export async function cancelDeadline(ctx: TenantContext, id: string) {
  assertCan(ctx, "deadlines:write");
  await transition(ctx, id, ["DRAFT", "VALIDATED"], "CANCELED", "deadline.cancel", {}, "Prazo cancelado");
}

export async function listDeadlinesForCase(ctx: TenantContext, caseId: string) {
  await assertCaseVisible(ctx, caseId);
  return listDeadlines(ctx, { caseId, includeClosed: true });
}
