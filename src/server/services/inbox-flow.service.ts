import { db } from "@/lib/db/client";
import { addDays, isYmd, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { isUniqueViolation } from "./db-errors";
import { notify } from "./notification.service";
import { assertNoticeRecipients, getNotice, visibility } from "./notice.service";
import { recordNoticeEvent } from "@/server/judicial/notice-events";

// ---------------------------------------------------------------- equipes de trabalho
export async function listTeams(ctx: TenantContext) {
  assertCan(ctx, "inbox:read");
  const teams = await db.workTeam.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, include: { members: { select: { userId: true } } } });
  const ids = [...new Set(teams.flatMap((t) => t.members.map((m) => m.userId)))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nm = new Map(users.map((u) => [u.id, u.name]));
  return teams.map((t) => ({ id: t.id, name: t.name, members: t.members.map((m) => ({ id: m.userId, name: nm.get(m.userId) ?? "—" })) }));
}

async function validMembers(ctx: TenantContext, userIds: string[]) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return unique;
  const rows = await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", userId: { in: unique }, role: { permissions: { has: "inbox:read" } } }, select: { userId: true } });
  if (rows.length !== unique.length) throw new ValidationError("Há membros inválidos ou sem acesso à caixa de intimações.", { members: ["Escolha apenas membros ativos com acesso à caixa de intimações."] });
  return unique;
}

export async function createTeam(ctx: TenantContext, input: { name: string; memberIds: string[] }) {
  assertCan(ctx, "members:manage");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) throw new ValidationError("O nome da equipe deve ter de 2 a 60 caracteres.", { name: ["Nome inválido."] });
  const members = await validMembers(ctx, input.memberIds);
  try {
    return await db.$transaction(async (tx) => {
      const t = await tx.workTeam.create({ data: { organizationId: ctx.organizationId, name, createdById: ctx.userId }, select: { id: true } });
      if (members.length) await tx.workTeamMember.createMany({ data: members.map((userId) => ({ teamId: t.id, organizationId: ctx.organizationId, userId })) });
      await audit({ action: "team.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "work_team", resourceId: t.id, metadata: { members: members.length }, meta: ctx.meta }, tx);
      return t;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Já existe uma equipe com esse nome.", { name: ["Já existe uma equipe com esse nome."] });
    throw e;
  }
}

export async function setTeamMembers(ctx: TenantContext, teamId: string, memberIds: string[]) {
  assertCan(ctx, "members:manage");
  const team = await db.workTeam.findFirst({ where: { id: teamId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!team) throw new NotFoundError("Equipe não encontrada.");
  const members = await validMembers(ctx, memberIds);
  await db.$transaction(async (tx) => {
    await tx.workTeamMember.deleteMany({ where: { teamId, organizationId: ctx.organizationId } });
    if (members.length) await tx.workTeamMember.createMany({ data: members.map((userId) => ({ teamId, organizationId: ctx.organizationId, userId })) });
    await audit({ action: "team.members", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "work_team", resourceId: teamId, metadata: { members: members.length }, meta: ctx.meta }, tx);
  });
}

export async function deleteTeam(ctx: TenantContext, teamId: string) {
  assertCan(ctx, "members:manage");
  const r = await db.$transaction(async (tx) => {
    const del = await tx.workTeam.deleteMany({ where: { id: teamId, organizationId: ctx.organizationId } });
    if (del.count !== 1) throw new NotFoundError("Equipe não encontrada.");
    // intimações que estavam com a equipe voltam para a Entrada
    const back = await tx.courtNotice.updateMany({ where: { organizationId: ctx.organizationId, teamId: null, status: "DISTRIBUTED", assigneeId: null }, data: { status: "NEW", assignedById: null } });
    await audit({ action: "team.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "work_team", resourceId: teamId, metadata: { returnedToInbox: back.count }, meta: ctx.meta }, tx);
    return back.count;
  });
  return { returnedToInbox: r };
}

// ---------------------------------------------------------------- fluxo da intimação
const isOpen = (s: string) => s === "NEW" || s === "DISTRIBUTED";

export async function assignNoticeToTeam(ctx: TenantContext, id: string, teamId: string) {
  assertCan(ctx, "inbox:write");
  const n = await getNotice(ctx, id);
  if (!isOpen(n.status)) throw new ConflictError("Reabra a intimação antes de redistribuí-la.");
  const team = await db.workTeam.findFirst({ where: { id: teamId, organizationId: ctx.organizationId }, include: { members: { select: { userId: true } } } });
  if (!team) throw new ValidationError("Equipe inválida.", { teamId: ["Selecione uma equipe."] });
  await assertNoticeRecipients(ctx, id, team.members.map(m => m.userId));
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: { teamId, assigneeId: null, assignedById: ctx.userId, status: "DISTRIBUTED" } });
    await recordNoticeEvent(tx, ctx, id, "TEAM_ASSIGNED", { teamId });
    await audit({ action: "notice.assign_team", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, metadata: { teamId }, meta: ctx.meta }, tx);
  });
  for (const m of team.members) {
    if (m.userId === ctx.userId) continue;
    await notify({ organizationId: ctx.organizationId, userId: m.userId, kind: "notice.assigned", title: `Intimação para a equipe ${team.name}: ${n.title}`, link: `/caixa-de-entrada/${id}`, dedupeKey: `notice-team:${id}:${teamId}:${m.userId}` });
  }
}

/** Devolve a intimação a quem a encarregou (ou à Entrada, se não houver mais essa pessoa). Só o responsável ou alguém da equipe pode devolver. */
export async function returnNotice(ctx: TenantContext, id: string) {
  assertCan(ctx, "inbox:write");
  const n = await getNotice(ctx, id);
  if (!isOpen(n.status) || n.status !== "DISTRIBUTED") throw new ConflictError("Só é possível devolver uma intimação distribuída.");
  let allowed = n.assigneeId === ctx.userId;
  if (!allowed && n.teamId) allowed = Boolean(await db.workTeamMember.findFirst({ where: { teamId: n.teamId, organizationId: ctx.organizationId, userId: ctx.userId }, select: { userId: true } }));
  if (!allowed) throw new ForbiddenError("Só o responsável (ou alguém da equipe responsável) pode devolver.");
  const back = n.assignedById && n.assignedById !== ctx.userId ? await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: n.assignedById, status: "ACTIVE", role: { permissions: { has: "inbox:read" } } }, select: { userId: true } }) : null;
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: back ? { assigneeId: back.userId, teamId: null, assignedById: ctx.userId, status: "DISTRIBUTED" } : { assigneeId: null, teamId: null, assignedById: null, status: "NEW" } });
    await recordNoticeEvent(tx, ctx, id, "RETURNED", { to: back?.userId ?? null });
    await audit({ action: "notice.return", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, metadata: { to: back?.userId ?? null }, meta: ctx.meta }, tx);
  });
  if (back) await notify({ organizationId: ctx.organizationId, userId: back.userId, kind: "notice.assigned", title: `Intimação devolvida para você: ${n.title}`, link: `/caixa-de-entrada/${id}`, dedupeKey: `notice-return:${id}:${Date.now()}` });
  return { toEntrada: !back };
}

/** Volta a intimação à Entrada, sem responsável (também reabre as já tratadas). */
export async function sendToEntrada(ctx: TenantContext, id: string) {
  assertCan(ctx, "inbox:write");
  const n = await getNotice(ctx, id);
  if (n.status === "DISCARDED") throw new ConflictError("Reabra a intimação descartada antes de enviá-la à Entrada.");
  if (n.status === "NEW" && !n.snoozedUntil) throw new ConflictError("A intimação já está na Entrada.");
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: { status: "NEW", assigneeId: null, teamId: null, assignedById: null, snoozedUntil: null, processedAt: null, processedById: null } });
    await recordNoticeEvent(tx, ctx, id, "TO_ENTRADA", { from: n.status });
    await audit({ action: "notice.to_entrada", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, metadata: { from: n.status }, meta: ctx.meta }, tx);
  });
}

/** Adormece até a data (ela reaparece nesse dia). `until = null` acorda agora. */
export async function snoozeNotice(ctx: TenantContext, id: string, until: string | null) {
  assertCan(ctx, "inbox:write");
  const n = await getNotice(ctx, id);
  if (!isOpen(n.status)) throw new ConflictError("Só intimações em aberto podem ser adormecidas.");
  if (until !== null) {
    const today = todayYmd(ctx.timezone);
    if (!isYmd(until) || until <= today || until > addDays(today, 365)) throw new ValidationError("Escolha uma data futura, em até 1 ano.", { until: ["Data inválida."] });
  }
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: { snoozedUntil: until ? ymdToDate(until) : null } });
    await recordNoticeEvent(tx, ctx, id, until ? "SNOOZED" : "WOKEN", { until });
    await audit({ action: until ? "notice.snooze" : "notice.wake", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, metadata: { until }, meta: ctx.meta }, tx);
  });
}

export function normalizeTags(raw: string[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    const v = t.trim().toLowerCase().replace(/\s+/g, " ");
    if (!v) continue;
    if (v.length > 30) throw new ValidationError("Cada etiqueta pode ter até 30 caracteres.", { tags: ["Etiqueta longa demais."] });
    if (!out.includes(v)) out.push(v);
  }
  if (out.length > 10) throw new ValidationError("No máximo 10 etiquetas por intimação.", { tags: ["Etiquetas demais."] });
  return out;
}

export async function setNoticeTags(ctx: TenantContext, id: string, tags: string[]) {
  assertCan(ctx, "inbox:write");
  await getNotice(ctx, id);
  const clean = normalizeTags(tags);
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: { tags: clean } });
    await audit({ action: "notice.tags", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, metadata: { count: clean.length }, meta: ctx.meta }, tx);
  });
  return clean;
}

export async function listNoticeTags(ctx: TenantContext): Promise<string[]> {
  assertCan(ctx, "inbox:read");
  const rows = await db.courtNotice.findMany({ where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { tags: true }, distinct: ["tags"] });
  return [...new Set(rows.flatMap(r => r.tags))].sort().slice(0, 100);
}

// ---------------------------------------------------------------- notas internas
export async function addNoticeNote(ctx: TenantContext, id: string, body: string) {
  assertCan(ctx, "inbox:write");
  await getNotice(ctx, id);
  const text = body.trim();
  if (!text || text.length > 2000) throw new ValidationError("A nota deve ter de 1 a 2000 caracteres.", { body: ["Nota inválida."] });
  const note = await db.$transaction(async (tx) => {
    const x = await tx.noticeNote.create({ data: { organizationId: ctx.organizationId, noticeId: id, authorId: ctx.userId, body: text }, select: { id: true } });
    await audit({ action: "notice.note_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, meta: ctx.meta }, tx);
    return x;
  });
  return note;
}

export async function deleteNoticeNote(ctx: TenantContext, id: string, noteId: string) {
  assertCan(ctx, "inbox:write");
  await getNotice(ctx, id);
  const note = await db.noticeNote.findFirst({ where: { id: noteId, noticeId: id, organizationId: ctx.organizationId }, select: { authorId: true } });
  if (!note) throw new NotFoundError("Nota não encontrada.");
  if (note.authorId !== ctx.userId && !ctx.isOwner) throw new ForbiddenError("Só quem escreveu a nota (ou o proprietário) pode apagá-la.");
  await db.$transaction(async (tx) => {
    await tx.noticeNote.delete({ where: { id: noteId } });
    await audit({ action: "notice.note_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, meta: ctx.meta }, tx);
  });
}
