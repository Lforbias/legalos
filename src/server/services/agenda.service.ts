import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { addDays } from "@/lib/dates/ymd";
import { utcToZoned, zonedToUtc } from "@/lib/dates/zoned";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { eventSchema, type EventInput } from "@/modules/agenda/schemas";
import { can, assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";

function assertRead(ctx: TenantContext) {
  if (!can(ctx, "deadlines:read") && !can(ctx, "tasks:read")) assertCan(ctx, "deadlines:read");
}
function assertWrite(ctx: TenantContext) {
  if (!can(ctx, "deadlines:write") && !can(ctx, "tasks:write")) assertCan(ctx, "deadlines:write");
}

const visible = (ctx: TenantContext): Prisma.AgendaEventWhereInput => ({ OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] });

function present<T extends { startsAt: Date; endsAt: Date | null }>(ctx: TenantContext, e: T) {
  const s = utcToZoned(e.startsAt, ctx.timezone);
  const en = e.endsAt ? utcToZoned(e.endsAt, ctx.timezone) : null;
  return { ...e, date: s.ymd, startTime: s.hhmm, endTime: en?.hhmm ?? "" };
}

/** Eventos entre duas datas (YYYY-MM-DD, inclusive), no fuso do escritório. */
export async function listEvents(ctx: TenantContext, fromYmd: string, toYmd: string) {
  assertRead(ctx);
  const rows = await db.agendaEvent.findMany({
    where: {
      AND: [
        { organizationId: ctx.organizationId, deletedAt: null, startsAt: { gte: zonedToUtc(fromYmd, "00:00", ctx.timezone), lt: zonedToUtc(addDays(toYmd, 1), "00:00", ctx.timezone) } },
        visible(ctx),
      ],
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 500,
    include: { case: { select: { id: true, title: true } }, client: { select: { id: true, name: true } } },
  });
  return rows.map((r) => present(ctx, r));
}

export async function getEvent(ctx: TenantContext, id: string) {
  assertRead(ctx);
  const e = await db.agendaEvent.findFirst({
    where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visible(ctx)] },
    include: { case: { select: { id: true, title: true } }, client: { select: { id: true, name: true } } },
  });
  if (!e) throw new NotFoundError("Compromisso não encontrado.");
  return present(ctx, e);
}

function toData(ctx: TenantContext, i: EventInput) {
  const startsAt = zonedToUtc(i.date, i.allDay ? "00:00" : i.startTime, ctx.timezone);
  const endsAt = !i.allDay && i.endTime ? zonedToUtc(i.date, i.endTime, ctx.timezone) : null;
  return {
    title: i.title.trim(), kind: i.kind, startsAt, endsAt, allDay: i.allDay,
    location: i.location.trim() || null, description: i.description.trim() || null,
    caseId: i.caseId || null, clientId: i.clientId || null,
  };
}

async function validateLinks(ctx: TenantContext, d: ReturnType<typeof toData>) {
  if (d.caseId) await assertCaseVisible(ctx, d.caseId);
  if (d.clientId) {
    assertCan(ctx, "clients:read");
    const c = await db.client.findFirst({ where: { id: d.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
    if (!c) throw new ValidationError("Cliente não encontrado.", { clientId: ["Selecione um cliente válido."] });
  }
}

export async function createEvent(ctx: TenantContext, raw: EventInput) {
  assertWrite(ctx);
  const data = toData(ctx, eventSchema.parse(raw));
  await validateLinks(ctx, data);
  return db.$transaction(async (tx) => {
    const e = await tx.agendaEvent.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId } });
    if (e.caseId) await logCaseEvent(tx, ctx, e.caseId, { kind: "AGENDA_CREATED", title: `Compromisso agendado: ${e.title}` });
    await audit({ action: "agenda.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "agenda_event", resourceId: e.id, meta: ctx.meta }, tx);
    return e;
  });
}

export async function updateEvent(ctx: TenantContext, id: string, raw: EventInput) {
  assertWrite(ctx);
  const data = toData(ctx, eventSchema.parse(raw));
  await getEvent(ctx, id);
  await validateLinks(ctx, data);
  await db.$transaction(async (tx) => {
    await tx.agendaEvent.update({ where: { id }, data });
    await audit({ action: "agenda.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "agenda_event", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function deleteEvent(ctx: TenantContext, id: string) {
  assertWrite(ctx);
  await getEvent(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.agendaEvent.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ action: "agenda.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "agenda_event", resourceId: id, meta: ctx.meta }, tx);
  });
}
