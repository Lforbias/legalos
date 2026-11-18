import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { isYmd } from "@/lib/dates/ymd";
import { utcToZoned, zonedToUtc } from "@/lib/dates/zoned";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { appendMessageTx } from "@/server/cowork/core";
import { publishInTx } from "@/server/cowork/realtime";
import { changeEventStatus, createEvent } from "./agenda.service";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility } from "./case.service";
import { assertCoworkAccess, assertCoworkUsers, displayNames } from "./cowork-access.service";
import { loadChannelForMember } from "./cowork-channel.service";
import { createWorkFromOrigin, type ConvertInput } from "./cowork-work.service";
import { notify } from "./notification.service";
import { resolveTenantContext } from "./tenant.service";
import { taskVisibility } from "./task.service";

/**
 * Videoconferência: NÃO configurada. Não há servidor de mídia (LiveKit/Jitsi) validado nesta instalação, então o
 * Cowork oferece gestão e agendamento de reuniões e NUNCA mostra controles de áudio/vídeo que simulem funcionamento.
 * Ver docs/cowork.md (comparativo LiveKit × Jitsi e requisitos para habilitar).
 */
export function videoConferenceStatus(): { enabled: false; reason: string } {
  return { enabled: false, reason: "Videoconferência ainda não habilitada: nenhum servidor de áudio e vídeo foi configurado e validado para este escritório." };
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

export const meetingSchema = z
  .object({
    title: z.string().trim().min(3, "Informe um título (mín. 3 caracteres).").max(200),
    description: z.string().trim().max(4000).optional().default(""),
    date: z.string().refine(isYmd, "Informe a data."),
    startTime: time,
    endTime: time.or(z.literal("")).optional().default(""),
    participantIds: z.array(z.uuid()).max(100).optional().default([]),
    channelId: z.union([z.uuid(), z.literal("")]).optional().default(""),
    caseId: z.union([z.uuid(), z.literal("")]).optional().default(""),
    taskId: z.union([z.uuid(), z.literal("")]).optional().default(""),
    addToAgenda: z.boolean().optional().default(true),
    requestKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  })
  .superRefine((v, ctx) => {
    if (v.endTime && v.endTime <= v.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "O término deve ser depois do início." });
  });
export type MeetingInput = z.input<typeof meetingSchema>;

async function assertParticipantsSeeCase(ctx: TenantContext, caseId: string, ids: string[]) {
  for (const uid of ids) {
    const other = uid === ctx.userId ? ctx : await resolveTenantContext(uid, ctx.organizationId);
    const ok = other ? await assertCaseVisible(other, caseId).then(() => true, () => false) : false;
    if (!ok) throw new ValidationError("Há participantes sem acesso ao processo vinculado (sigilo).");
  }
}

export async function createMeeting(ctx: TenantContext, raw: MeetingInput) {
  await assertCoworkAccess(ctx);
  assertCan(ctx, "cowork:meetings");
  const input = meetingSchema.parse(raw);
  const dup = await db.coworkMeeting.findUnique({ where: { organizationId_requestKey: { organizationId: ctx.organizationId, requestKey: input.requestKey } }, select: { id: true } });
  if (dup) return dup;
  const participantIds = [...new Set([ctx.userId, ...input.participantIds])];
  await assertCoworkUsers(ctx, participantIds);
  const channel = input.channelId ? await loadChannelForMember(ctx, input.channelId, { write: true }) : null;
  if (input.caseId) {
    await assertCaseVisible(ctx, input.caseId);
    await assertParticipantsSeeCase(ctx, input.caseId, participantIds);
  }
  if (input.taskId) {
    assertCan(ctx, "tasks:read");
    const t = await db.task.findFirst({ where: { AND: [{ id: input.taskId, organizationId: ctx.organizationId, deletedAt: null }, taskVisibility(ctx)] }, select: { id: true } });
    if (!t) throw new ValidationError("Tarefa não encontrada.");
  }
  const startsAt = zonedToUtc(input.date, input.startTime, ctx.timezone);
  const endsAt = input.endTime ? zonedToUtc(input.date, input.endTime, ctx.timezone) : null;
  const names = await displayNames(ctx.organizationId, [ctx.userId]);
  const meeting = await db.$transaction(async (tx) => {
    const m = await tx.coworkMeeting.create({
      data: { organizationId: ctx.organizationId, title: input.title, description: input.description || null, startsAt, endsAt, hostId: ctx.userId, channelId: channel?.id ?? null, caseId: input.caseId || null, taskId: input.taskId || null, createdById: ctx.userId, requestKey: input.requestKey },
    });
    await tx.coworkMeetingParticipant.createMany({ data: participantIds.map((uid) => ({ meetingId: m.id, organizationId: ctx.organizationId, userId: uid, isHost: uid === ctx.userId, rsvp: uid === ctx.userId ? ("ACCEPTED" as const) : ("PENDING" as const), respondedAt: uid === ctx.userId ? new Date() : null })) });
    if (channel) await appendMessageTx(tx, { organizationId: ctx.organizationId, channelId: channel.id, authorId: null, authorKind: "SYSTEM", body: `${names.get(ctx.userId) ?? "Alguém"} agendou uma reunião.`, resources: [{ kind: "MEETING", resourceId: m.id }] });
    await audit({ action: "cowork.meeting.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_meeting", resourceId: m.id, metadata: { participants: participantIds.length, channelLinked: Boolean(channel), caseLinked: Boolean(input.caseId) }, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "meeting", u: participantIds });
    return m;
  });
  // Agenda do escritório: usa o serviço original da agenda (com as permissões dele).
  if (input.addToAgenda && (can(ctx, "deadlines:write") || can(ctx, "tasks:write"))) {
    const e = await createEvent(ctx, { title: `Reunião: ${input.title}`.slice(0, 200), kind: "MEETING", date: input.date, allDay: false, startTime: input.startTime, endTime: input.endTime, location: "Cowork (reunião interna)", description: `Reunião interna agendada no Cowork com ${participantIds.length} participante(s). Detalhes: /cowork/reunioes/${meeting.id}`, caseId: input.caseId, clientId: "", assigneeId: ctx.userId });
    await db.coworkMeeting.update({ where: { id: meeting.id }, data: { agendaEventId: e.id } });
  }
  await notify(participantIds.filter((u) => u !== ctx.userId).map((uid) => ({ organizationId: ctx.organizationId, userId: uid, kind: "cowork.meeting", title: `${names.get(ctx.userId) ?? "Alguém"} convidou você para uma reunião`, link: `/cowork/reunioes/${meeting.id}`, dedupeKey: `cowork-meeting-invite:${meeting.id}:${uid}` }))).catch(() => 0);
  return { id: meeting.id };
}

/** Quem vê uma reunião: participantes e membros da conversa vinculada; sala de processo exige ver o processo. */
async function loadMeeting(ctx: TenantContext, id: string) {
  await assertCoworkAccess(ctx);
  if (!z.uuid().safeParse(id).success) throw new NotFoundError("Reunião não encontrada.");
  const m = await db.coworkMeeting.findFirst({
    where: { id, organizationId: ctx.organizationId, OR: [{ participants: { some: { userId: ctx.userId } } }, { channel: { members: { some: { userId: ctx.userId } } } }] },
    include: { participants: true },
  });
  if (!m) throw new NotFoundError("Reunião não encontrada.");
  if (m.caseId) await assertCaseVisible(ctx, m.caseId).catch(() => { throw new NotFoundError("Reunião não encontrada."); });
  const me = m.participants.find((p) => p.userId === ctx.userId) ?? null;
  const isHost = m.hostId === ctx.userId;
  const canAdmin = isHost || (Boolean(me) && can(ctx, "cowork:meetings"));
  return { m, me, isHost, canAdmin };
}

export async function getMeeting(ctx: TenantContext, id: string) {
  const { m, me, isHost, canAdmin } = await loadMeeting(ctx, id);
  const [names, items, caseRow, taskRow, channelRow] = await Promise.all([
    displayNames(ctx.organizationId, [m.hostId, ...m.participants.map((p) => p.userId), m.minutesById]),
    db.coworkWorkItem.findMany({ where: { meetingId: m.id, organizationId: ctx.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, purpose: true, taskId: true, agendaEventId: true } }),
    m.caseId ? db.case.findFirst({ where: { id: m.caseId, organizationId: ctx.organizationId }, select: { id: true, title: true, number: true } }) : null,
    m.taskId && can(ctx, "tasks:read") ? db.task.findFirst({ where: { AND: [{ id: m.taskId, organizationId: ctx.organizationId, deletedAt: null }, taskVisibility(ctx)] }, select: { id: true, title: true } }) : null,
    m.channelId ? db.coworkChannel.findFirst({ where: { id: m.channelId, organizationId: ctx.organizationId, members: { some: { userId: ctx.userId } } }, select: { id: true, name: true, kind: true } }) : null,
  ]);
  const s = utcToZoned(m.startsAt, ctx.timezone);
  const e = m.endsAt ? utcToZoned(m.endsAt, ctx.timezone) : null;
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    date: s.ymd,
    startTime: s.hhmm,
    endTime: e?.hhmm ?? "",
    startsAt: m.startsAt.toISOString(),
    status: m.status,
    hostId: m.hostId,
    hostName: names.get(m.hostId) ?? "Pessoa removida",
    isHost,
    canAdmin,
    isParticipant: Boolean(me),
    myRsvp: me?.rsvp ?? null,
    minutes: m.minutes,
    decisions: m.decisions,
    minutesBy: m.minutesById ? (names.get(m.minutesById) ?? null) : null,
    minutesAt: m.minutesAt?.toISOString() ?? null,
    startedAt: m.startedAt?.toISOString() ?? null,
    endedAt: m.endedAt?.toISOString() ?? null,
    agendaEventId: m.agendaEventId,
    case: caseRow,
    task: taskRow,
    channel: channelRow,
    participants: m.participants
      .map((p) => ({ userId: p.userId, name: names.get(p.userId) ?? "Pessoa removida", isHost: p.isHost, rsvp: p.rsvp, attendance: p.attendance }))
      .sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name, "pt-BR")),
    workItems: items,
    video: videoConferenceStatus(),
  };
}

export async function listMeetings(ctx: TenantContext, scope: "upcoming" | "past" = "upcoming") {
  await assertCoworkAccess(ctx);
  const now = new Date();
  const dayStart = new Date(now.getTime() - 12 * 3600_000);
  const where: Prisma.CoworkMeetingWhereInput = {
    organizationId: ctx.organizationId,
    participants: { some: { userId: ctx.userId } },
    OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }],
    ...(scope === "upcoming" ? { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, startsAt: { gte: dayStart } } : { OR: [{ status: { in: ["ENDED", "CANCELED"] } }, { startsAt: { lt: dayStart } }] }),
  };
  const rows = await db.coworkMeeting.findMany({ where, orderBy: { startsAt: scope === "upcoming" ? "asc" : "desc" }, take: 100, include: { participants: { select: { userId: true, rsvp: true } } } });
  const names = await displayNames(ctx.organizationId, rows.map((r) => r.hostId));
  return rows.map((r) => {
    const s = utcToZoned(r.startsAt, ctx.timezone);
    return { id: r.id, title: r.title, date: s.ymd, startTime: s.hhmm, status: r.status, hostName: names.get(r.hostId) ?? "", participantCount: r.participants.length, myRsvp: r.participants.find((p) => p.userId === ctx.userId)?.rsvp ?? null, hasMinutes: Boolean(r.minutes) };
  });
}

export async function respondMeeting(ctx: TenantContext, id: string, rsvp: "ACCEPTED" | "DECLINED") {
  const { m, me } = await loadMeeting(ctx, id);
  if (!me) throw new ForbiddenError("Você não foi convidado(a) para esta reunião.");
  if (m.status === "CANCELED" || m.status === "ENDED") throw new ConflictError("A reunião já foi encerrada ou cancelada.");
  await db.$transaction(async (tx) => {
    await tx.coworkMeetingParticipant.update({ where: { meetingId_userId: { meetingId: id, userId: ctx.userId } }, data: { rsvp, respondedAt: new Date() } });
    await publishInTx(tx, { o: ctx.organizationId, t: "meeting", u: m.participants.map((p) => p.userId) });
  });
}

/** Ciclo de vida: iniciar, encerrar ou cancelar (anfitrião ou participante com permissão de reuniões). */
export async function setMeetingStatus(ctx: TenantContext, id: string, action: "start" | "end" | "cancel") {
  const { m, canAdmin } = await loadMeeting(ctx, id);
  if (!canAdmin) throw new ForbiddenError("Só o anfitrião ou quem administra reuniões pode alterar a reunião.");
  const allowed: Record<typeof action, string[]> = { start: ["SCHEDULED"], end: ["IN_PROGRESS", "SCHEDULED"], cancel: ["SCHEDULED"] };
  if (!allowed[action].includes(m.status)) throw new ConflictError("A reunião não está em uma situação que permita essa ação.");
  const now = new Date();
  const data: Prisma.CoworkMeetingUpdateInput = action === "start" ? { status: "IN_PROGRESS", startedAt: now } : action === "end" ? { status: "ENDED", endedAt: now, startedAt: m.startedAt ?? null } : { status: "CANCELED", endedAt: now };
  await db.$transaction(async (tx) => {
    const res = await tx.coworkMeeting.updateMany({ where: { id, organizationId: ctx.organizationId, status: m.status }, data: data as Prisma.CoworkMeetingUpdateManyMutationInput });
    if (res.count !== 1) throw new ConflictError("A reunião mudou. Recarregue a página.");
    await audit({ action: `cowork.meeting.${action}`, organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_meeting", resourceId: id, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "meeting", u: m.participants.map((p) => p.userId) });
  });
  if (m.agendaEventId && (can(ctx, "deadlines:write") || can(ctx, "tasks:write"))) {
    const status = action === "start" ? "IN_PROGRESS" : action === "end" ? "DONE" : "CANCELED";
    await changeEventStatus(ctx, m.agendaEventId, status).catch(() => undefined);
  }
  if (action === "cancel") {
    const names = await displayNames(ctx.organizationId, [ctx.userId]);
    await notify(m.participants.filter((p) => p.userId !== ctx.userId).map((p) => ({ organizationId: ctx.organizationId, userId: p.userId, kind: "cowork.meeting", title: `${names.get(ctx.userId) ?? "Alguém"} cancelou a reunião ${m.title}`, link: `/cowork/reunioes/${id}`, dedupeKey: `cowork-meeting-cancel:${id}:${p.userId}` }))).catch(() => 0);
  }
}

/** Presença registrada pelo anfitrião (evidência declarada por quem conduziu; não é inferida por estar online). */
export async function setAttendance(ctx: TenantContext, id: string, userId: string, attendance: "PRESENT" | "ABSENT" | "UNKNOWN") {
  const { m, canAdmin } = await loadMeeting(ctx, id);
  if (!canAdmin) throw new ForbiddenError("Só o anfitrião registra a presença.");
  if (m.status === "SCHEDULED" || m.status === "CANCELED") throw new ConflictError("Registre a presença depois de iniciar a reunião.");
  if (!m.participants.some((p) => p.userId === userId)) throw new NotFoundError("Participante não encontrado.");
  await db.coworkMeetingParticipant.update({ where: { meetingId_userId: { meetingId: id, userId } }, data: { attendance, attendanceById: ctx.userId } });
}

export async function updateParticipants(ctx: TenantContext, id: string, userIds: string[]) {
  const { m, canAdmin } = await loadMeeting(ctx, id);
  if (!canAdmin) throw new ForbiddenError("Só o anfitrião altera os participantes.");
  if (m.status === "ENDED" || m.status === "CANCELED") throw new ConflictError("A reunião já terminou.");
  const ids = [...new Set([m.hostId, ...userIds])];
  await assertCoworkUsers(ctx, ids);
  if (m.caseId) await assertParticipantsSeeCase(ctx, m.caseId, ids);
  const current = new Set(m.participants.map((p) => p.userId));
  const added = ids.filter((u) => !current.has(u));
  const removed = [...current].filter((u) => !ids.includes(u));
  await db.$transaction(async (tx) => {
    if (removed.length) await tx.coworkMeetingParticipant.deleteMany({ where: { meetingId: id, userId: { in: removed } } });
    if (added.length) await tx.coworkMeetingParticipant.createMany({ data: added.map((uid) => ({ meetingId: id, organizationId: ctx.organizationId, userId: uid })), skipDuplicates: true });
    await audit({ action: "cowork.meeting.participants", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_meeting", resourceId: id, metadata: { added: added.length, removed: removed.length }, meta: ctx.meta }, tx);
    await publishInTx(tx, { o: ctx.organizationId, t: "meeting", u: [...ids, ...removed] });
  });
  const names = await displayNames(ctx.organizationId, [ctx.userId]);
  await notify(added.map((uid) => ({ organizationId: ctx.organizationId, userId: uid, kind: "cowork.meeting", title: `${names.get(ctx.userId) ?? "Alguém"} convidou você para uma reunião`, link: `/cowork/reunioes/${id}`, dedupeKey: `cowork-meeting-invite:${id}:${uid}` }))).catch(() => 0);
}

export const minutesSchema = z.object({ minutes: z.string().trim().max(20000).optional().default(""), decisions: z.string().trim().max(10000).optional().default("") });

/** Ata e decisões. Ao registrar, a conversa vinculada recebe o cartão da reunião (o conteúdo fica na reunião). */
export async function saveMinutes(ctx: TenantContext, id: string, raw: z.input<typeof minutesSchema>) {
  const { m, canAdmin } = await loadMeeting(ctx, id);
  if (!canAdmin) throw new ForbiddenError("Só o anfitrião ou quem administra reuniões registra a ata.");
  if (m.status === "CANCELED") throw new ConflictError("Reunião cancelada.");
  const input = minutesSchema.parse(raw);
  const first = !m.minutes && !m.decisions;
  await db.$transaction(async (tx) => {
    await tx.coworkMeeting.update({ where: { id }, data: { minutes: input.minutes || null, decisions: input.decisions || null, minutesById: ctx.userId, minutesAt: new Date() } });
    await audit({ action: "cowork.meeting.minutes", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cowork_meeting", resourceId: id, meta: ctx.meta }, tx);
    if (first && m.channelId && (input.minutes || input.decisions)) {
      const member = await tx.coworkChannelMember.findFirst({ where: { channelId: m.channelId, userId: ctx.userId }, select: { userId: true } });
      if (member) await appendMessageTx(tx, { organizationId: ctx.organizationId, channelId: m.channelId, authorId: null, authorKind: "SYSTEM", body: "A ata da reunião foi registrada.", resources: [{ kind: "MEETING", resourceId: id }] });
    }
    await publishInTx(tx, { o: ctx.organizationId, t: "meeting", u: m.participants.map((p) => p.userId) });
  });
}

/** Encaminhamento da reunião: vira tarefa/compromisso no módulo original, com responsável e prazo. */
export async function addMeetingActionItem(ctx: TenantContext, id: string, raw: ConvertInput) {
  const { m, canAdmin } = await loadMeeting(ctx, id);
  if (!canAdmin) throw new ForbiddenError("Só o anfitrião ou quem administra reuniões registra encaminhamentos.");
  if (m.status === "CANCELED") throw new ConflictError("Reunião cancelada.");
  const channel = m.channelId ? await db.coworkChannel.findFirst({ where: { id: m.channelId, organizationId: ctx.organizationId, archivedAt: null, members: { some: { userId: ctx.userId } } }, select: { id: true, department: true } }) : null;
  return createWorkFromOrigin(ctx, { kind: "meeting", meetingId: id }, { ...raw, caseId: raw.caseId || m.caseId || "" }, {
    channelId: channel?.id ?? null,
    department: channel?.department ?? null,
    originLink: `/cowork/reunioes/${id}`,
    originLabel: `reunião "${m.title}"`,
    threadRootId: null,
  });
}

/** Reuniões em andamento com presença registrada (evidência para o estado "Em reunião"). */
export async function usersInMeetingNow(organizationId: string): Promise<Set<string>> {
  const rows = await db.coworkMeetingParticipant.findMany({ where: { organizationId, attendance: "PRESENT", meeting: { status: "IN_PROGRESS" } }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

export async function meetingCaseAccessible(ctx: TenantContext, caseId: string) {
  return assertCaseVisible(ctx, caseId).then(() => true, () => false);
}
