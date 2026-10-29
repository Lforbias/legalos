import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { contentHash, parseNoticeText } from "@/lib/notices/parse";
import { decideCaseMatch, type CaseMatchState } from "@/lib/judicial/communication";
import type { OriginKind } from "@/lib/judicial/contracts";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { noticeListOptionsSchema } from "@/modules/inbox/list-schemas";
import { assignSchema, discardSchema, noticeSchema, toNoticeData, type NoticeInput } from "@/modules/inbox/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertActiveMember, assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";
import { dateToYmd, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { runWorkflows } from "./workflow.service";
import { notify } from "./notification.service";
import { emitWebhookEvent } from "./webhook.service";
import { notifyBoxChange } from "@/server/judicial/live";
import { recordNoticeEvent } from "@/server/judicial/notice-events";

type Status = (typeof import("@/modules/inbox/schemas").NOTICE_STATUSES)[number];

/** Intimações sem processo vinculado são do escritório; as vinculadas seguem a visibilidade (sigilo) do processo. */
export function visibility(ctx: TenantContext): Prisma.CourtNoticeWhereInput {
  return { OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] };
}

/** Análise do texto colado (não grava nada). */
export function analyzeText(ctx: TenantContext, text: string) {
  assertCan(ctx, "inbox:write");
  return parseNoticeText(text);
}

export const NOTICE_BOXES = ["entrada", "minhas", "geral", "equipe", "acervo", "adormecidas", "descartadas"] as const;
export type NoticeBox = (typeof NOTICE_BOXES)[number];
export type NoticeFilters = { q?: string; status?: Status; assigneeId?: string; caseId?: string; duplicates?: boolean; box?: NoticeBox; teamId?: string; tag?: string; kind?: string; origin?: string; court?: string; receivedFrom?: string; receivedTo?: string; publishedFrom?: string; publishedTo?: string; page?: number; pageSize?: number; sort?: string; professionalId?: string; originKind?: string; viewed?: "yes" | "no" };

/** Intimações adormecidas só reaparecem a partir da data escolhida. */
function awake(ctx: TenantContext): Prisma.CourtNoticeWhereInput {
  return { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: ymdToDate(todayYmd(ctx.timezone)) } }] };
}
function boxWhere(ctx: TenantContext, box: NoticeBox, teamId?: string): Prisma.CourtNoticeWhereInput[] {
  const open = { status: { in: ["NEW", "DISTRIBUTED"] as Status[] } };
  const asleep: Prisma.CourtNoticeWhereInput = { snoozedUntil: { gt: ymdToDate(todayYmd(ctx.timezone)) } };
  switch (box) {
    case "entrada": return [{ status: "NEW" }, awake(ctx)];
    case "minhas": return [{ status: "DISTRIBUTED", assigneeId: ctx.userId }, awake(ctx)];
    case "geral": return [{ status: "DISTRIBUTED" }, awake(ctx)];
    case "equipe": return [{ status: "DISTRIBUTED", teamId: teamId ?? "00000000-0000-0000-0000-000000000000" }, awake(ctx)];
    case "acervo": return [{ status: "PROCESSED" }];
    case "adormecidas": return [open, asleep];
    case "descartadas": return [{ status: "DISCARDED" }];
  }
}

export async function listNotices(ctx: TenantContext, f: NoticeFilters = {}) {
  assertCan(ctx, "inbox:read");
  const options = noticeListOptionsSchema.safeParse({ pageSize: 200, ...f });
  if (!options.success) throw new ValidationError("Filtros inválidos. Confira as datas e a paginação.");
  const o = options.data;
  const and: Prisma.CourtNoticeWhereInput[] = [{ organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)];
  if (f.box) and.push(...boxWhere(ctx, f.box, f.teamId));
  else if (f.status) {
    and.push({ status: f.status });
    if (f.status === "NEW" || f.status === "DISTRIBUTED") and.push(awake(ctx));
  } else and.push({ status: { in: ["NEW", "DISTRIBUTED"] } }, awake(ctx));
  if (f.tag) and.push({ tags: { has: f.tag.trim().toLowerCase().slice(0, 30) } });
  if (f.assigneeId) and.push({ assigneeId: f.assigneeId });
  if (f.caseId) and.push({ caseId: f.caseId });
  if (f.duplicates) and.push({ duplicateOfId: { not: null } });
  // Box 2.0: filtros pelo que o LegalOS sabe da origem. "Não vista" = ninguém do escritório abriu aqui (não é ciência oficial).
  if (f.professionalId) and.push({ professionalId: f.professionalId });
  if (f.originKind) and.push({ originKind: f.originKind });
  if (f.viewed === "no") and.push({ firstViewedAt: null });
  if (f.viewed === "yes") and.push({ firstViewedAt: { not: null } });
  const q = f.q?.trim().slice(0, 80);
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }, { caseNumber: { contains: q } }] });
  if (o.kind) and.push({ kind: o.kind });
  if (o.court) and.push({ court: { contains: o.court, mode: "insensitive" } });
  if (o.origin === "DJEN" || o.origin === "MNI") and.push({ source: "IMPORTED", externalKey: { startsWith: o.origin === "DJEN" ? "djen:" : "mni:" } });
  else if (o.origin === "OTHER_IMPORT") and.push({ source: "IMPORTED", OR: [{ externalKey: null }, { NOT: [{ externalKey: { startsWith: "djen:" } }, { externalKey: { startsWith: "mni:" } }] }] });
  else if (o.origin) and.push({ source: o.origin });
  if (o.receivedFrom || o.receivedTo) and.push({ receivedAt: { ...(o.receivedFrom ? { gte: ymdToDate(o.receivedFrom) } : {}), ...(o.receivedTo ? { lte: ymdToDate(o.receivedTo) } : {}) } });
  if (o.publishedFrom || o.publishedTo) and.push({ publishedAt: { ...(o.publishedFrom ? { gte: ymdToDate(o.publishedFrom) } : {}), ...(o.publishedTo ? { lte: ymdToDate(o.publishedTo) } : {}) } });
  const where: Prisma.CourtNoticeWhereInput = { AND: and };
  const total = await db.courtNotice.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / o.pageSize));
  const page = Math.min(o.page, pageCount);
  const rows = await db.courtNotice.findMany({
      where,
      orderBy: [{ receivedAt: o.sort }, { createdAt: o.sort }, { id: "asc" }],
      skip: (page - 1) * o.pageSize,
      take: o.pageSize,
      select: {
        id: true, title: true, kind: true, status: true, source: true, externalKey: true, updatedAt: true, caseNumber: true, court: true, publishedAt: true, receivedAt: true, assigneeId: true, teamId: true, tags: true, snoozedUntil: true, duplicateOfId: true,
        originKind: true, sourceSystem: true, courtCode: true, capturedAt: true, firstViewedAt: true, officialAckAt: true, officialAckState: true, professionalId: true,
        case: { select: { id: true, title: true } },
      },
    });
  const ids = [...new Set(rows.map((r) => r.assigneeId).filter((x): x is string => !!x))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return { total, page, pageSize: o.pageSize, pageCount, truncated: total > rows.length, items: rows.map((r) => ({ ...r, assigneeName: r.assigneeId ? (names.get(r.assigneeId) ?? null) : null })) };
}

export async function noticeCounts(ctx: TenantContext) {
  assertCan(ctx, "inbox:read");
  const groups = await db.courtNotice.groupBy({ by: ["status"], where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, _count: { _all: true } });
  const c = (s: Status) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { NEW: c("NEW"), DISTRIBUTED: c("DISTRIBUTED"), PROCESSED: c("PROCESSED"), DISCARDED: c("DISCARDED") };
}

/** Contagens de cada caixa (respeitando sigilo e intimações adormecidas). */
export async function noticeBoxCounts(ctx: TenantContext) {
  assertCan(ctx, "inbox:read");
  const base: Prisma.CourtNoticeWhereInput[] = [{ organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)];
  const count = (box: NoticeBox) => db.courtNotice.count({ where: { AND: [...base, ...boxWhere(ctx, box)] } });
  const [entrada, minhas, geral, acervo, adormecidas, descartadas] = await Promise.all([count("entrada"), count("minhas"), count("geral"), count("acervo"), count("adormecidas"), count("descartadas")]);
  const perTeam = await db.courtNotice.groupBy({ by: ["teamId"], where: { AND: [...base, { status: "DISTRIBUTED", teamId: { not: null } }, awake(ctx)] }, _count: { _all: true } });
  return { entrada, minhas, geral, acervo, adormecidas, descartadas, teams: Object.fromEntries(perTeam.map((g) => [g.teamId as string, g._count._all])) as Record<string, number> };
}

export async function getNotice(ctx: TenantContext, id: string) {
  assertCan(ctx, "inbox:read");
  const n = await db.courtNotice.findFirst({
    where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] },
    include: { case: { select: { id: true, title: true, number: true } } },
  });
  if (!n) throw new NotFoundError("Intimação não encontrada.");
  const userIds = [n.assigneeId, n.assignedById, n.processedById, n.createdById].filter((x): x is string => !!x);
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const nm = (x: string | null) => users.find((u) => u.id === x)?.name ?? null;
  const duplicateOf = n.duplicateOfId
    ? await db.courtNotice.findFirst({ where: { AND: [{ id: n.duplicateOfId, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, title: true, receivedAt: true } })
    : null;
  const [tasks, deadlines] = await Promise.all([
    db.task.findMany({ where: { organizationId: ctx.organizationId, sourceNoticeId: id, deletedAt: null }, select: { id: true, title: true, status: true } }),
    db.deadline.findMany({ where: { organizationId: ctx.organizationId, sourceNoticeId: id }, select: { id: true, title: true, status: true, dueDate: true } }),
  ]);
  const team = n.teamId ? await db.workTeam.findFirst({ where: { id: n.teamId, organizationId: ctx.organizationId }, select: { id: true, name: true } }) : null;
  const notes = await db.noticeNote.findMany({ where: { noticeId: id, organizationId: ctx.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, authorId: true, createdAt: true } });
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(notes.map((x) => x.authorId))] } }, select: { id: true, name: true } });
  return { ...n, team, assignedByName: nm(n.assignedById), notes: notes.map((x) => ({ ...x, authorName: authors.find((u) => u.id === x.authorId)?.name ?? "—" })), assigneeName: nm(n.assigneeId), processedByName: nm(n.processedById), createdByName: nm(n.createdById), duplicateOf, tasks, deadlines, parsed: parseNoticeText(n.content) };
}

/** Vinculação SEGURA pelo CNJ: só vincula quando há um único processo; ambíguo ou ausente nunca cria processo duplicado. */
export async function matchCaseByCnj(ctx: TenantContext, cnj: string | null): Promise<{ state: CaseMatchState; caseId: string | null }> {
  if (!cnj) return { state: "NO_CNJ", caseId: null };
  const rows = await db.case.findMany({ where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, number: cnj }, caseVisibility(ctx)] }, select: { id: true, number: true }, take: 3 });
  return decideCaseMatch(cnj, rows);
}

/** Metadados de uma captura automática (origem, identificador oficial, evidência). Ausente = registro manual. */
export type CaptureMeta = {
  originKind: OriginKind;
  sourceSystem: string;
  officialId: string;
  courtCode: string | null;
  professionalId?: string | null;
  capturedAt: Date;
  syncRunId?: string | null;
  /** Evidência técnica sanitizada (hash do bruto, página, janela). Nunca o texto da publicação. */
  evidence?: Record<string, unknown>;
};

export async function createNotice(ctx: TenantContext, raw: NoticeInput, opts: { source?: "IMPORTED"; externalKey?: string; capture?: CaptureMeta } = {}) {
  assertCan(ctx, "inbox:write");
  const input = noticeSchema.parse(raw);
  const data = toNoticeData(input);
  let caseId: string | null = null;
  let autoLinked = false;
  let caseMatchState: CaseMatchState = "NO_CNJ";
  if (input.caseId) {
    await assertCaseVisible(ctx, input.caseId);
    caseId = input.caseId;
    caseMatchState = "LINKED";
  } else {
    const m = await matchCaseByCnj(ctx, data.caseNumber);
    caseMatchState = m.state;
    if (m.caseId) {
      caseId = m.caseId;
      autoLinked = true;
    }
  }
  const cap = opts.capture;
  const originKind: OriginKind = cap ? cap.originKind : opts.source === "IMPORTED" ? "IMPORT" : "MANUAL";
  const hash = contentHash(data.content);
  const dup = await db.courtNotice.findFirst({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, contentHash: hash }, visibility(ctx)] },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const created = await db.$transaction(async (tx) => {
    const n = await tx.courtNotice.create({
      data: {
        ...data,
        ...(opts.source ? { source: opts.source } : {}),
        externalKey: opts.externalKey ?? null,
        organizationId: ctx.organizationId,
        caseId,
        contentHash: hash,
        duplicateOfId: dup?.id ?? null,
        createdById: ctx.userId,
        originKind,
        caseMatchState,
        ...(cap
          ? {
              sourceSystem: cap.sourceSystem,
              officialId: cap.officialId,
              courtCode: cap.courtCode,
              professionalId: cap.professionalId ?? null,
              capturedAt: cap.capturedAt,
              syncRunId: cap.syncRunId ?? null,
              officialAckState: cap.originKind === "PRIVATE_COMMUNICATION" ? "UNKNOWN" : "NOT_APPLICABLE",
            }
          : {}),
      },
    });
    await tx.noticeEvent.create({
      data: cap
        ? { organizationId: ctx.organizationId, noticeId: n.id, kind: "CAPTURED", runId: cap.syncRunId ?? null, data: { origin: cap.originKind, source: cap.sourceSystem, officialId: cap.officialId, ...(cap.evidence ?? {}) } as never }
        : { organizationId: ctx.organizationId, noticeId: n.id, kind: "STATUS", actorId: ctx.userId, data: { action: "created", origin: originKind } as never },
    });
    if (caseId) {
      await logCaseEvent(tx, ctx, caseId, { kind: "NOTICE_LINKED", title: `Intimação recebida: ${n.title}`, description: autoLinked ? "Vinculada automaticamente pelo número CNJ." : null });
      await tx.noticeEvent.create({ data: { organizationId: ctx.organizationId, noticeId: n.id, kind: "LINKED", actorId: cap ? null : ctx.userId, data: { caseId, how: autoLinked ? "AUTO_CNJ" : "MANUAL" } as never } });
    }
    await audit({ action: "notice.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: n.id, metadata: { source: n.source, duplicate: Boolean(dup), autoLinked }, meta: ctx.meta }, tx);
    return n;
  });
  notifyBoxChange(ctx.organizationId);
  if (!dup) await emitWebhookEvent(ctx.organizationId, "notice.created", { noticeId: created.id, caseId: created.caseId, source: created.source });
  if (!dup) await runWorkflows(ctx, "NOTICE_RECEIVED", { type: "notice", id: created.id, userId: ctx.userId, label: created.title, baseDate: dateToYmd(created.receivedAt), caseId: created.caseId, noticeId: created.id });
  return { ...created, autoLinked, duplicate: Boolean(dup) };
}

async function load(ctx: TenantContext, id: string) {
  const n = await getNotice(ctx, id);
  return n;
}

/** Distribuição não concede acesso a processo sigiloso nem revela seu título em notificações. */
export async function assertNoticeRecipients(ctx: TenantContext, noticeId: string, userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (!ids.length) throw new ValidationError("Escolha destinatários ativos com acesso à caixa.");
  const members = await db.membership.findMany({ where: { organizationId: ctx.organizationId, userId: { in: ids }, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "inbox:read" } } }, select: { userId: true, role: { select: { permissions: true } } } });
  if (members.length !== ids.length) throw new ValidationError("Há destinatários inativos ou sem acesso à caixa.");
  for (const member of members) {
    const targetCtx = { ...ctx, userId: member.userId, permissions: new Set(member.role.permissions) };
    if (!await db.courtNotice.count({ where: { AND: [{ id: noticeId, organizationId: ctx.organizationId, deletedAt: null }, visibility(targetCtx)] } })) throw new ValidationError("Um destinatário não tem acesso ao processo. Confira o sigilo antes de distribuir.");
  }
}

export async function assignNotice(ctx: TenantContext, id: string, raw: { userId: string }) {
  assertCan(ctx, "inbox:write");
  const { userId } = assignSchema.parse(raw);
  const n = await load(ctx, id);
  if (n.status === "PROCESSED" || n.status === "DISCARDED") throw new ConflictError("Reabra a intimação antes de redistribuí-la.");
  await assertActiveMember(ctx, userId);
  const target = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId, status: "ACTIVE" }, select: { role: { select: { permissions: true } } } });
  if (!target?.role.permissions.includes("inbox:read")) throw new ValidationError("Este membro não tem acesso à caixa de intimações.", { userId: ["Escolha um membro com acesso à caixa de intimações."] });
  await assertNoticeRecipients(ctx, id, [userId]);
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: { assigneeId: userId, teamId: null, assignedById: ctx.userId, status: "DISTRIBUTED" } });
    await recordNoticeEvent(tx, ctx, id, "ASSIGNED", { to: userId });
    await audit({ action: "notice.assign", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, metadata: { to: userId }, meta: ctx.meta }, tx);
  });
  if (userId !== ctx.userId) {
    await notify({ organizationId: ctx.organizationId, userId, kind: "notice.assigned", title: `Intimação distribuída para você: ${n.title}`, link: `/caixa-de-entrada/${id}`, dedupeKey: `notice-assigned:${id}:${userId}` });
  }
}

export async function linkNoticeCase(ctx: TenantContext, id: string, caseId: string | null) {
  assertCan(ctx, "inbox:write");
  const n = await load(ctx, id);
  if (n.status === "PROCESSED" || n.status === "DISCARDED") throw new ConflictError("Reabra a intimação antes de alterar o processo.");
  if (caseId) await assertCaseVisible(ctx, caseId);
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: { caseId } });
    await recordNoticeEvent(tx, ctx, id, "CASE_LINKED", { caseId, how: "MANUAL" });
    if (caseId) await logCaseEvent(tx, ctx, caseId, { kind: "NOTICE_LINKED", title: `Intimação vinculada: ${n.title}` });
    await audit({ action: "notice.link_case", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, metadata: { caseId }, meta: ctx.meta }, tx);
  });
}

export async function markProcessed(ctx: TenantContext, id: string) {
  assertCan(ctx, "inbox:write");
  const n = await load(ctx, id);
  if (n.status === "PROCESSED" || n.status === "DISCARDED") throw new ConflictError("A intimação já foi encerrada.");
  await db.$transaction(async (tx) => {
    const r = await tx.courtNotice.updateMany({ where: { id, organizationId: ctx.organizationId, status: n.status }, data: { status: "PROCESSED", processedAt: new Date(), processedById: ctx.userId } });
    if (r.count !== 1) throw new ConflictError("A intimação foi alterada por outra pessoa. Recarregue a página.");
    await recordNoticeEvent(tx, ctx, id, "PROCESSED");
    if (n.caseId) await logCaseEvent(tx, ctx, n.caseId, { kind: "NOTICE_PROCESSED", title: `Intimação tratada: ${n.title}` });
    await audit({ action: "notice.process", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function discardNotice(ctx: TenantContext, id: string, raw: { reason: string }) {
  assertCan(ctx, "inbox:write");
  const { reason } = discardSchema.parse(raw);
  const n = await load(ctx, id);
  if (n.status === "PROCESSED" || n.status === "DISCARDED") throw new ConflictError("A intimação já foi encerrada.");
  if (n.tasks.length || n.deadlines.length) throw new ConflictError("Há tarefas ou prazos criados a partir desta intimação; marque-a como tratada em vez de descartar.");
  await db.$transaction(async (tx) => {
    const r = await tx.courtNotice.updateMany({ where: { id, organizationId: ctx.organizationId, status: n.status }, data: { status: "DISCARDED", discardReason: reason, processedAt: new Date(), processedById: ctx.userId } });
    if (r.count !== 1) throw new ConflictError("A intimação foi alterada por outra pessoa. Recarregue a página.");
    await recordNoticeEvent(tx, ctx, id, "DISCARDED", { reason });
    await audit({ action: "notice.discard", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, metadata: { reason }, meta: ctx.meta }, tx);
  });
}

export async function reopenNotice(ctx: TenantContext, id: string) {
  assertCan(ctx, "inbox:write");
  const n = await load(ctx, id);
  if (n.status !== "PROCESSED" && n.status !== "DISCARDED") throw new ConflictError("A intimação já está aberta.");
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: { status: n.assigneeId || n.teamId ? "DISTRIBUTED" : "NEW", discardReason: null, processedAt: null, processedById: null } });
    await recordNoticeEvent(tx, ctx, id, "REOPENED");
    await audit({ action: "notice.reopen", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function deleteNotice(ctx: TenantContext, id: string) {
  assertCan(ctx, "inbox:write");
  const n = await load(ctx, id);
  if (n.tasks.length || n.deadlines.length) throw new ValidationError("Não é possível excluir: há tarefas ou prazos criados a partir desta intimação.");
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ action: "notice.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: id, meta: ctx.meta }, tx);
  });
}

/** Valida e devolve a intimação de origem para criação de tarefa/prazo (mesmo escritório, visível). */
export async function resolveSourceNotice(ctx: TenantContext, id: string | undefined) {
  if (!id) return undefined;
  assertCan(ctx, "inbox:read");
  const n = await getNotice(ctx, id);
  return n;
}
