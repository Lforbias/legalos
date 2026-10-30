import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { addDays, isYmd, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import type { TenantContext } from "@/server/context";
import { visibility } from "@/server/services/notice.service";
import { caseVisibility } from "@/server/services/case.service";
import { CAPABILITIES, CAPABILITY_LABEL } from "@/lib/judicial/contracts";
import { connectorKeyForMniSystem, getConnector } from "@/lib/judicial/catalog";
import { homologationOf, HOMOLOGATION_LABEL, type EvidenceRow } from "@/lib/judicial/evidence";
import { getCourtSystem } from "@/lib/court-systems";
import { plainLimitations, type ConnectionCard } from "@/server/judicial/connections.service";
import { loadEvidence } from "@/server/judicial/evidence.service";
import { recordNoticeEvent } from "@/server/judicial/notice-events";
import { assertActiveMember, logCaseEvent } from "@/server/services/case.service";
import { assertNoticeRecipients } from "@/server/services/notice.service";
import { taskVisibility } from "@/server/services/task.service";
import { audit } from "@/server/services/audit.service";
import { notify } from "@/server/services/notification.service";
import { isUniqueViolation } from "@/server/services/db-errors";
import { RUN_HEARTBEAT_TIMEOUT_MIN } from "@/lib/judicial/health-policy";

export type BoxV3Folder = "entrada" | "abertas" | "acervo" | "adormecidas";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertNoticeId(id: string) {
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Comunicação não encontrada.");
}

function assertBoxV3Read(ctx: TenantContext) {
  if (!ctx.permissions.has("inbox:read")) throw new ForbiddenError();
}

function assertBoxV3Write(ctx: TenantContext) {
  if (!ctx.permissions.has("inbox:write")) throw new ForbiddenError();
}

/** Cartões V3 sem selecionar segredo de conexão, senha ou material do certificado. */
export async function listBoxV3Connections(ctx: TenantContext, now = new Date()): Promise<ConnectionCard[]> {
  assertBoxV3Read(ctx);
  const org = ctx.organizationId;
  const [monitors, connections, accesses, evidence, professionals] = await Promise.all([
    db.djenMonitor.findMany({ where: { organizationId: org }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, oabNumber: true, oabUf: true, professionalId: true, enabled: true, lastSuccessAt: true, lastCaptureAt: true } }),
    db.courtConnection.findMany({ where: { organizationId: org }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, jtr: true, system: true, enabled: true, lastSyncAt: true, lastStatus: true } }),
    db.portalAccess.findMany({ where: { organizationId: org }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, target: true, enabled: true, lastLoginAt: true } }),
    loadEvidence(org),
    db.professionalIdentity.findMany({ where: { organizationId: org }, select: { id: true, name: true } }),
  ]);
  const profName = new Map(professionals.map((item) => [item.id, item.name]));
  const latestEvidenceAt = (items: EvidenceRow[]) => items.reduce<Date | null>((latest, item) => !latest || item.checkedAt > latest ? item.checkedAt : latest, null);
  const capabilityViews = (key: string, scoped: EvidenceRow[]) => {
    const connector = getConnector(key);
    if (!connector) return [];
    return CAPABILITIES.filter((op) => connector.capabilities[op].implemented).map((op) => {
      const state = homologationOf(key, op, scoped, now);
      return { op, label: CAPABILITY_LABEL[op], implemented: true, state, stateLabel: HOMOLOGATION_LABEL[state], lastEvidenceAt: scoped.filter((item) => item.connectorKey === key && item.operation === op).sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0]?.checkedAt ?? null, note: null };
    });
  };
  const cards: ConnectionCard[] = [];

  for (const monitor of monitors) {
    const key = "djen";
    const scoped = evidence.filter((item) => item.connectorKey === key && (item.sourceId === monitor.id || item.sourceId == null) && (item.courtCode === "*" || item.courtCode === monitor.oabUf));
    cards.push({ id: monitor.id, kind: "DJEN", connectorKey: key, title: `Publicações do DJEN — ${monitor.label}`, subtitle: `OAB ${monitor.oabUf}/${monitor.oabNumber}`, courtCode: "*", enabled: monitor.enabled, state: "OFF", stateLabel: monitor.enabled ? "Ligado no cadastro antigo" : "Desligado no cadastro antigo", headline: "Histórico preservado; sem validação do Box 3.0.", nextAction: null, coverage: null, coverageLabel: null, lastSuccessAt: monitor.lastSuccessAt, lastCaptureAt: monitor.lastCaptureAt, lastEvidenceAt: latestEvidenceAt(scoped), capabilities: capabilityViews(key, scoped), limitations: plainLimitations(getConnector(key)?.limitations ?? []), professional: monitor.professionalId ? profName.get(monitor.professionalId) ?? null : null, technical: null });
  }

  for (const connection of connections) {
    const key = connectorKeyForMniSystem(connection.system);
    const scoped = evidence.filter((item) => item.connectorKey === key && (item.sourceId === connection.id || item.sourceId == null) && (item.courtCode === connection.jtr || item.courtCode === "*"));
    cards.push({ id: connection.id, kind: "MNI", connectorKey: key, title: connection.label, subtitle: `${getCourtSystem(connection.system)?.label ?? connection.system} · tribunal ${connection.jtr}`, courtCode: connection.jtr, enabled: connection.enabled, state: "OFF", stateLabel: connection.enabled ? "Ligado no cadastro antigo" : "Desligado no cadastro antigo", headline: "Histórico preservado; sem validação do Box 3.0.", nextAction: null, coverage: null, coverageLabel: null, lastSuccessAt: connection.lastStatus === "OK" ? connection.lastSyncAt : null, lastCaptureAt: null, lastEvidenceAt: latestEvidenceAt(scoped), capabilities: capabilityViews(key, scoped), limitations: plainLimitations(getConnector(key)?.limitations ?? []), professional: null, technical: null });
  }

  for (const access of accesses) {
    const key = "pje-portal";
    const scoped = evidence.filter((item) => item.connectorKey === key && (item.sourceId === access.id || item.sourceId == null) && (item.courtCode === access.target || item.courtCode === "*"));
    cards.push({ id: access.id, kind: "PORTAL", connectorKey: key, title: access.label, subtitle: `Acesso de portal · ${access.target}`, courtCode: access.target, enabled: access.enabled, state: "OFF", stateLabel: access.enabled ? "Ligado no cadastro antigo" : "Desligado no cadastro antigo", headline: "Histórico preservado; sem validação do Box 3.0.", nextAction: null, coverage: null, coverageLabel: null, lastSuccessAt: access.lastLoginAt, lastCaptureAt: null, lastEvidenceAt: latestEvidenceAt(scoped), capabilities: capabilityViews(key, scoped), limitations: plainLimitations(getConnector(key)?.limitations ?? []), professional: null, technical: null });
  }
  return cards;
}

function folderWhere(folder: BoxV3Folder, ctx: TenantContext): Prisma.CourtNoticeWhereInput {
  const today = ymdToDate(todayYmd(ctx.timezone));
  switch (folder) {
    case "entrada": return { status: "NEW", OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: today } }] };
    case "abertas": return { status: { in: ["NEW", "DISTRIBUTED"] }, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: today } }] };
    case "acervo": return { status: "PROCESSED" };
    case "adormecidas": return { status: { in: ["NEW", "DISTRIBUTED"] }, snoozedUntil: { gt: today } };
  }
}

/** Leitura V3 isolada: tenant + sigilo do processo, sem chamar serviços do Box retirado. */
export async function listBoxV3Notices(ctx: TenantContext, opts: { folder?: BoxV3Folder; q?: string; kind?: string; origin?: string; reading?: "seen" | "unseen"; official?: "confirmed" | "pending" | "none"; page?: number; take?: number } = {}) {
  assertBoxV3Read(ctx);
  const folder = opts.folder ?? "entrada";
  const q = opts.q?.trim().slice(0, 80);
  const base: Prisma.CourtNoticeWhereInput[] = [
    { organizationId: ctx.organizationId, deletedAt: null },
    visibility(ctx),
    folderWhere(folder, ctx),
  ];
  if (q) base.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { caseNumber: { contains: q } }, { court: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLocaleLowerCase("pt-BR") } }] });
  if (["INTIMACAO", "CITACAO", "DESPACHO", "DECISAO", "SENTENCA", "OUTRO"].includes(opts.kind ?? "")) base.push({ kind: opts.kind as Prisma.EnumNoticeKindFilter["equals"] });
  if (["DJEN_PUBLICATION", "PRIVATE_COMMUNICATION", "PROCESS_MOVEMENT", "IMPORT", "MANUAL"].includes(opts.origin ?? "")) base.push({ originKind: opts.origin });
  if (opts.reading === "seen") base.push({ firstViewedAt: { not: null } });
  if (opts.reading === "unseen") base.push({ firstViewedAt: null });
  if (opts.official === "confirmed") base.push({ OR: [{ officialAckAt: { not: null } }, { officialAckState: "ACKNOWLEDGED" }] });
  if (opts.official === "pending") base.push({ officialAckAt: null, officialAckState: { in: ["PENDING", "UNKNOWN"] } });
  if (opts.official === "none") base.push({ officialAckAt: null, OR: [{ officialAckState: null }, { officialAckState: "NOT_APPLICABLE" }] });
  const where = { AND: base } satisfies Prisma.CourtNoticeWhereInput;
  const pageSize = Math.min(Math.max(opts.take ?? 50, 1), 100);
  const total = await db.courtNotice.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(opts.page ?? 1), 1), pageCount);
  const [rows, folderCounts] = await Promise.all([
    db.courtNotice.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, title: true, kind: true, status: true, source: true, originKind: true,
        sourceSystem: true, courtCode: true, caseNumber: true, court: true, publishedAt: true,
        receivedAt: true, capturedAt: true, firstViewedAt: true, snoozedUntil: true, tags: true, officialAckAt: true,
        officialAckState: true, assigneeId: true, teamId: true,
        case: { select: { id: true, title: true } },
      },
    }),
    Promise.all([
      db.courtNotice.count({ where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx), folderWhere("entrada", ctx)] } }),
      db.courtNotice.count({ where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx), folderWhere("abertas", ctx)] } }),
      db.courtNotice.count({ where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx), folderWhere("acervo", ctx)] } }),
      db.courtNotice.count({ where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx), folderWhere("adormecidas", ctx)] } }),
    ]),
  ]);
  const assigneeIds = [...new Set(rows.map((row) => row.assigneeId).filter((id): id is string => Boolean(id)))];
  const teamIds = [...new Set(rows.map((row) => row.teamId).filter((id): id is string => Boolean(id)))];
  const members = assigneeIds.length ? await db.membership.findMany({ where: { organizationId: ctx.organizationId, userId: { in: assigneeIds } }, select: { userId: true, user: { select: { name: true } } } }) : [];
  const teams = teamIds.length ? await db.workTeam.findMany({ where: { organizationId: ctx.organizationId, id: { in: teamIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(members.map((member) => [member.userId, member.user.name]));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  return {
    total,
    page,
    pageCount,
    items: rows.map((row) => ({ ...row, assigneeName: row.assigneeId ? names.get(row.assigneeId) ?? null : null, teamName: row.teamId ? teamNames.get(row.teamId) ?? null : null })),
    counts: { entrada: folderCounts[0], abertas: folderCounts[1], acervo: folderCounts[2], adormecidas: folderCounts[3] },
  };
}

/** Detalhe somente de leitura; nunca altera ciência ou estado oficial no tribunal. */
export async function getBoxV3Notice(ctx: TenantContext, id: string) {
  assertBoxV3Read(ctx);
  assertNoticeId(id);
  const notice = await db.courtNotice.findFirst({
    where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] },
    select: {
      id: true, title: true, content: true, kind: true, status: true, source: true, documentId: true,
      originKind: true, sourceSystem: true, courtCode: true, caseNumber: true, court: true,
      publishedAt: true, receivedAt: true, capturedAt: true, firstViewedAt: true, snoozedUntil: true, tags: true,
      officialAckAt: true, officialAckState: true, assigneeId: true, teamId: true,
      case: { select: { id: true, title: true, number: true } },
    },
  });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  const [member, team, events] = await Promise.all([
    notice.assigneeId ? db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: notice.assigneeId }, select: { user: { select: { name: true } } } }) : null,
    notice.teamId ? db.workTeam.findFirst({ where: { organizationId: ctx.organizationId, id: notice.teamId }, select: { name: true } }) : null,
    db.noticeEvent.findMany({ where: { organizationId: ctx.organizationId, noticeId: notice.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, kind: true, data: true, createdAt: true } }),
  ]);
  const attachedDocument = notice.documentId && notice.case?.id && ctx.permissions.has("documents:read") ? await db.document.findFirst({ where: { id: notice.documentId, organizationId: ctx.organizationId, caseId: notice.case.id, deletedAt: null }, select: { id: true, name: true, currentVersion: true } }) : null;
  const eventLabel: Record<string, string> = { CAPTURED: "Capturada pela fonte", VIEWED: "Abertura interna registrada", ASSIGNED: "Distribuição interna", LINKED: "Vínculo com processo alterado", DOCUMENT: "Peça vinculada à comunicação", OFFICIAL_ACK: "Marco de ciência informado pela fonte" };
  const statusLabels: Record<string, string> = { processed: "Tratada internamente", reopened: "Reaberta internamente", discarded: "Descartada internamente", created: "Registrada no LegalOS", snoozed: "Adormecida internamente", woken: "Retornada à caixa", to_entrada: "Retornada à Entrada" };
  return { ...notice, assigneeName: member?.user.name ?? null, history: events.map((event) => {
    const action = event.data && typeof event.data === "object" && !Array.isArray(event.data) && "action" in event.data && typeof event.data.action === "string" ? event.data.action : null;
    const documentId = event.data && typeof event.data === "object" && !Array.isArray(event.data) && "documentId" in event.data ? event.data.documentId : undefined;
    return { id: event.id, at: event.createdAt, label: event.kind === "STATUS" ? statusLabels[action ?? ""] ?? "Situação interna alterada" : event.kind === "DOCUMENT" && !documentId ? "Vínculo da peça removido" : eventLabel[event.kind] ?? "Atualização no histórico" };
  }), teamName: team?.name ?? null, attachedDocument };
}

export async function listBoxV3NoticeDocuments(ctx: TenantContext, id: string) {
  assertBoxV3Read(ctx);
  assertNoticeId(id);
  if (!ctx.permissions.has("cases:read") || !ctx.permissions.has("documents:read")) return [];
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { caseId: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  if (!notice.caseId) return [];
  return db.document.findMany({ where: { organizationId: ctx.organizationId, caseId: notice.caseId, deletedAt: null }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 200, select: { id: true, name: true, currentVersion: true } });
}

/** Links an existing same-case document to the communication; it does not download or create court records. */
export async function setBoxV3NoticeDocument(ctx: TenantContext, id: string, documentId: string | null) {
  assertBoxV3Write(ctx);
  assertNoticeId(id);
  if (!ctx.permissions.has("cases:read") || !ctx.permissions.has("documents:read")) throw new ForbiddenError();
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, caseId: true, status: true, documentId: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  if (notice.status === "PROCESSED" || notice.status === "DISCARDED") throw new ConflictError("Reabra a comunicação antes de alterar a peça vinculada.");
  if (documentId) {
    if (!UUID_PATTERN.test(documentId)) throw new ValidationError("Escolha um documento válido.");
    if (!notice.caseId) throw new ConflictError("Vincule a comunicação a um processo antes de selecionar uma peça.");
    const document = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId, caseId: notice.caseId, deletedAt: null }, select: { id: true } });
    if (!document) throw new NotFoundError("Documento não encontrado neste processo.");
  }
  if (notice.documentId === documentId) return;
  await db.$transaction(async (tx) => {
    const changed = await tx.courtNotice.updateMany({ where: { id: notice.id, organizationId: ctx.organizationId, status: notice.status, documentId: notice.documentId }, data: { documentId } });
    if (changed.count !== 1) throw new ConflictError("A comunicação mudou. Atualize a página antes de continuar.");
    await recordNoticeEvent(tx, ctx, notice.id, "DOCUMENT_LINKED", { documentId });
    await audit({ action: "notice.document_link", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { documentId, boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
}

/** Marca apenas a abertura interna, após ação explícita. Nunca altera a ciência oficial. */
export async function markBoxV3NoticeViewed(ctx: TenantContext, id: string) {
  assertBoxV3Write(ctx);
  assertNoticeId(id);
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  const first = await db.$executeRaw`UPDATE court_notices SET first_viewed_at = now(), first_viewed_by_id = ${ctx.userId}::uuid WHERE id = ${notice.id}::uuid AND organization_id = ${ctx.organizationId}::uuid AND first_viewed_at IS NULL`;
  const alreadyRecorded = await db.noticeEvent.findFirst({ where: { noticeId: notice.id, organizationId: ctx.organizationId, kind: "VIEWED", actorId: ctx.userId }, select: { id: true } });
  if (!alreadyRecorded) await recordNoticeEvent(db, ctx, notice.id, "VIEWED", { firstOverall: first === 1 });
  return { firstView: first === 1 };
}

export async function addBoxV3NoticeNote(ctx: TenantContext, id: string, rawBody: string) {
  assertBoxV3Write(ctx);
  assertNoticeId(id);
  const body = rawBody.trim();
  if (body.length < 1 || body.length > 4000) throw new ValidationError("A nota deve ter entre 1 e 4.000 caracteres.");
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  return db.$transaction(async (tx) => {
    const note = await tx.noticeNote.create({ data: { organizationId: ctx.organizationId, noticeId: notice.id, authorId: ctx.userId, body } });
    await audit({ action: "notice.note.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { noteId: note.id, boxVersion: "3.0" }, meta: ctx.meta }, tx);
    return note.id;
  });
}

export async function setBoxV3NoticeProcessed(ctx: TenantContext, id: string, processed: boolean) {
  assertBoxV3Write(ctx);
  assertNoticeId(id);
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, title: true, caseId: true, assigneeId: true, teamId: true, status: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  if (processed) {
    if (notice.status === "PROCESSED" || notice.status === "DISCARDED") throw new ConflictError("Esta comunicação já está encerrada.");
    await db.$transaction(async (tx) => {
      const changed = await tx.courtNotice.updateMany({ where: { id: notice.id, organizationId: ctx.organizationId, status: notice.status }, data: { status: "PROCESSED", processedAt: new Date(), processedById: ctx.userId, snoozedUntil: null } });
      if (changed.count !== 1) throw new ConflictError("A comunicação mudou. Atualize a página antes de continuar.");
      await recordNoticeEvent(tx, ctx, notice.id, "PROCESSED");
      if (notice.caseId) await logCaseEvent(tx, ctx, notice.caseId, { kind: "NOTICE_PROCESSED", title: `Comunicação tratada no LegalOS: ${notice.title}` });
      await audit({ action: "notice.process", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { boxVersion: "3.0" }, meta: ctx.meta }, tx);
    });
    return;
  }
  if (notice.status !== "PROCESSED" && notice.status !== "DISCARDED") throw new ConflictError("Esta comunicação já está aberta.");
  await db.$transaction(async (tx) => {
    const changed = await tx.courtNotice.updateMany({ where: { id: notice.id, organizationId: ctx.organizationId, status: notice.status }, data: { status: notice.assigneeId || notice.teamId ? "DISTRIBUTED" : "NEW", discardReason: null, processedAt: null, processedById: null } });
    if (changed.count !== 1) throw new ConflictError("A comunicação mudou. Atualize a página antes de continuar.");
    await recordNoticeEvent(tx, ctx, notice.id, "REOPENED");
    await audit({ action: "notice.reopen", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
}

/** Adormece uma comunicação até uma data ou a desperta agora; operação apenas interna. */
export async function setBoxV3NoticeSnooze(ctx: TenantContext, id: string, until: string | null) {
  assertBoxV3Write(ctx);
  assertNoticeId(id);
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, status: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  if (notice.status !== "NEW" && notice.status !== "DISTRIBUTED") throw new ConflictError("Só comunicações em aberto podem ser adormecidas.");
  if (until !== null) {
    const today = todayYmd(ctx.timezone);
    if (!isYmd(until) || until <= today || until > addDays(today, 365)) throw new ValidationError("Escolha uma data futura, em até 1 ano.");
  }
  await db.$transaction(async (tx) => {
    const changed = await tx.courtNotice.updateMany({ where: { id: notice.id, organizationId: ctx.organizationId, status: notice.status }, data: { snoozedUntil: until ? ymdToDate(until) : null } });
    if (changed.count !== 1) throw new ConflictError("A comunicação mudou. Atualize a página antes de continuar.");
    await recordNoticeEvent(tx, ctx, notice.id, until ? "SNOOZED" : "WOKEN", { until });
    await audit({ action: until ? "notice.snooze" : "notice.wake", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { until, boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
}

/** Retorna à Entrada sem responsável, sem apagar o histórico da distribuição anterior. */
export async function sendBoxV3NoticeToInbox(ctx: TenantContext, id: string) {
  assertBoxV3Write(ctx);
  assertNoticeId(id);
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, status: true, snoozedUntil: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  if (notice.status === "DISCARDED") throw new ConflictError("Reabra a comunicação descartada antes de enviá-la à Entrada.");
  if (notice.status === "NEW" && !notice.snoozedUntil) throw new ConflictError("A comunicação já está na Entrada.");
  await db.$transaction(async (tx) => {
    const changed = await tx.courtNotice.updateMany({ where: { id: notice.id, organizationId: ctx.organizationId, status: notice.status }, data: { status: "NEW", assigneeId: null, teamId: null, assignedById: null, snoozedUntil: null, processedAt: null, processedById: null } });
    if (changed.count !== 1) throw new ConflictError("A comunicação mudou. Atualize a página antes de continuar.");
    await recordNoticeEvent(tx, ctx, notice.id, "TO_ENTRADA", { from: notice.status });
    await audit({ action: "notice.to_entrada", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { from: notice.status, boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
}

export async function setBoxV3NoticeTags(ctx: TenantContext, id: string, rawTags: string) {
  assertBoxV3Write(ctx);
  assertNoticeId(id);
  if (rawTags.length > 320) throw new ValidationError("Use até 10 etiquetas, com no máximo 30 caracteres cada.");
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  const tags = [...new Set(rawTags.split(",").map((tag) => tag.trim().toLocaleLowerCase("pt-BR")).filter(Boolean))];
  if (tags.length > 10 || tags.some((tag) => tag.length > 30)) throw new ValidationError("Use até 10 etiquetas, com no máximo 30 caracteres cada.");
  await db.$transaction(async (tx) => {
    await tx.courtNotice.update({ where: { id: notice.id }, data: { tags } });
    await audit({ action: "notice.tags", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { count: tags.length, boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
}

export async function listBoxV3NoticeNotes(ctx: TenantContext, id: string) {
  assertBoxV3Read(ctx);
  assertNoticeId(id);
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  const notes = await db.noticeNote.findMany({ where: { organizationId: ctx.organizationId, noticeId: notice.id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, authorId: true, body: true, createdAt: true } });
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(notes.map((note) => note.authorId))] } }, select: { id: true, name: true } });
  const authorNames = new Map(authors.map((author) => [author.id, author.name]));
  return notes.map(({ authorId, ...note }) => ({ ...note, authorName: authorNames.get(authorId) ?? "Integrante do escritório" }));
}

export async function listBoxV3NoticeProvidences(ctx: TenantContext, id: string) {
  assertBoxV3Read(ctx);
  assertNoticeId(id);
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  const [tasks, deadlines] = await Promise.all([
    ctx.permissions.has("tasks:read") ? db.task.findMany({ where: { AND: [{ organizationId: ctx.organizationId, sourceNoticeId: id, deletedAt: null }, taskVisibility(ctx)] }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50, select: { id: true, title: true, status: true, dueDate: true } }) : Promise.resolve([]),
    ctx.permissions.has("deadlines:read") ? db.deadline.findMany({ where: { organizationId: ctx.organizationId, sourceNoticeId: id, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 50, select: { id: true, title: true, status: true, dueDate: true } }) : Promise.resolve([]),
  ]);
  return { tasks, deadlines };
}

export async function listBoxV3LinkableCases(ctx: TenantContext, noticeId: string, rawQuery: string) {
  assertBoxV3Read(ctx);
  assertNoticeId(noticeId);
  if (!ctx.permissions.has("cases:read")) return [];
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id: noticeId, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { caseId: true, caseNumber: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  const q = rawQuery.trim().slice(0, 80) || notice.caseNumber || "";
  if (!q && !notice.caseId) return [];
  const matchingCases: Prisma.CaseWhereInput[] = [];
  if (notice.caseId) matchingCases.push({ id: notice.caseId });
  if (q) matchingCases.push({ number: { contains: q } }, { title: { contains: q, mode: "insensitive" } });
  return db.case.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx), { OR: matchingCases }] },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 30,
    select: { id: true, number: true, title: true },
  });
}

export async function linkBoxV3NoticeCase(ctx: TenantContext, noticeId: string, caseId: string | null) {
  assertBoxV3Write(ctx);
  assertNoticeId(noticeId);
  if (!ctx.permissions.has("cases:read")) throw new ForbiddenError();
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id: noticeId, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, title: true, caseId: true, documentId: true, status: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  if (notice.status === "PROCESSED" || notice.status === "DISCARDED") throw new ConflictError("Reabra a comunicação antes de alterar o processo vinculado.");
  if (caseId) {
    if (!UUID_PATTERN.test(caseId)) throw new ValidationError("Escolha um processo válido.");
    const visibleCase = await db.case.findFirst({ where: { AND: [{ id: caseId, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true } });
    if (!visibleCase) throw new NotFoundError("Processo não encontrado.");
  }
  await db.$transaction(async (tx) => {
    const changed = await tx.courtNotice.updateMany({ where: { id: notice.id, organizationId: ctx.organizationId, status: notice.status }, data: { caseId, ...(caseId !== notice.caseId ? { documentId: null } : {}) } });
    if (changed.count !== 1) throw new ConflictError("A comunicação mudou. Atualize a página antes de continuar.");
    await recordNoticeEvent(tx, ctx, notice.id, "CASE_LINKED", { caseId, how: "MANUAL" });
    if (caseId) await logCaseEvent(tx, ctx, caseId, { kind: "NOTICE_LINKED", title: `Comunicação vinculada: ${notice.title}` });
    await audit({ action: "notice.link_case", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { caseId, clearedDocumentLink: caseId !== notice.caseId && Boolean(notice.documentId), boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
}

export async function listBoxV3Recipients(ctx: TenantContext) {
  assertBoxV3Write(ctx);
  return db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "inbox:read" } } }, orderBy: { user: { name: "asc" } }, select: { userId: true, user: { select: { name: true } } } });
}

export async function listBoxV3Teams(ctx: TenantContext, noticeId: string) {
  assertBoxV3Write(ctx);
  assertNoticeId(noticeId);
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id: noticeId, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, status: true } });
  if (!notice || notice.status === "PROCESSED" || notice.status === "DISCARDED") return [];
  const teams = await db.workTeam.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, members: { where: { organizationId: ctx.organizationId }, select: { userId: true } } } });
  const eligible: { id: string; name: string; memberCount: number }[] = [];
  for (const team of teams) {
    const userIds = team.members.map((member) => member.userId);
    if (!userIds.length) continue;
    try {
      await assertNoticeRecipients(ctx, notice.id, userIds);
      eligible.push({ id: team.id, name: team.name, memberCount: userIds.length });
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
    }
  }
  return eligible;
}

/** Distribuição interna apenas. Confere que o destinatário também pode ver o processo, inclusive sob sigilo. */
export async function assignBoxV3Notice(ctx: TenantContext, id: string, userId: string) {
  assertBoxV3Write(ctx);
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(userId)) throw new ValidationError("Escolha uma comunicação e uma pessoa válidas.");
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, title: true, status: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  if (notice.status === "PROCESSED" || notice.status === "DISCARDED") throw new ConflictError("Esta comunicação está encerrada e não pode ser redistribuída.");
  const recipientName = await assertActiveMember(ctx, userId);
  const recipient = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId, status: "ACTIVE" }, select: { role: { select: { permissions: true } } } });
  if (!recipient?.role.permissions.includes("inbox:read")) throw new ValidationError("Esta pessoa não tem acesso à caixa de intimações.");
  await assertNoticeRecipients(ctx, notice.id, [userId]);
  await db.$transaction(async (tx) => {
    const changed = await tx.courtNotice.updateMany({ where: { id: notice.id, organizationId: ctx.organizationId, status: notice.status }, data: { assigneeId: userId, teamId: null, assignedById: ctx.userId, status: "DISTRIBUTED" } });
    if (changed.count !== 1) throw new ConflictError("A comunicação mudou. Atualize a página antes de continuar.");
    await recordNoticeEvent(tx, ctx, notice.id, "ASSIGNED", { to: userId });
    await audit({ action: "notice.assign", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { to: userId, boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
  if (userId !== ctx.userId) await notify({ organizationId: ctx.organizationId, userId, kind: "notice.assigned", title: `Comunicação distribuída para você: ${notice.title}`, body: `Responsável: ${recipientName}`, link: `/box-v3/entrada/${notice.id}`, dedupeKey: `notice-assigned:${notice.id}:${userId}` });
}

export async function assignBoxV3NoticeToTeam(ctx: TenantContext, id: string, teamId: string) {
  assertBoxV3Write(ctx);
  assertNoticeId(id);
  const notice = await db.courtNotice.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, visibility(ctx)] }, select: { id: true, title: true, status: true } });
  if (!notice) throw new NotFoundError("Comunicação não encontrada.");
  if (notice.status === "PROCESSED" || notice.status === "DISCARDED") throw new ConflictError("Esta comunicação está encerrada e não pode ser redistribuída.");
  if (!UUID_PATTERN.test(teamId)) throw new ValidationError("Escolha uma equipe válida.");
  const team = await db.workTeam.findFirst({ where: { id: teamId, organizationId: ctx.organizationId }, select: { id: true, name: true, members: { where: { organizationId: ctx.organizationId }, select: { userId: true } } } });
  if (!team || !team.members.length) throw new ValidationError("Escolha uma equipe com integrantes ativos.");
  const userIds = team.members.map((member) => member.userId);
  await assertNoticeRecipients(ctx, notice.id, userIds);
  await db.$transaction(async (tx) => {
    const changed = await tx.courtNotice.updateMany({ where: { id: notice.id, organizationId: ctx.organizationId, status: notice.status }, data: { teamId: team.id, assigneeId: null, assignedById: ctx.userId, status: "DISTRIBUTED" } });
    if (changed.count !== 1) throw new ConflictError("A comunicação mudou. Atualize a página antes de continuar.");
    await recordNoticeEvent(tx, ctx, notice.id, "TEAM_ASSIGNED", { teamId: team.id });
    await audit({ action: "notice.assign_team", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: notice.id, metadata: { teamId: team.id, boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
  for (const userId of userIds) if (userId !== ctx.userId) await notify({ organizationId: ctx.organizationId, userId, kind: "notice.assigned", title: `Comunicação distribuída para a equipe ${team.name}: ${notice.title}`, link: `/box-v3/entrada/${notice.id}`, dedupeKey: `notice-team:${notice.id}:${team.id}:${userId}` });
}

/** Execuções e evidências em formato operacional, sem cursor, payload ou mensagem técnica bruta. */
export async function getBoxV3Monitoring(ctx: TenantContext, input: { runPage?: number } = {}) {
  assertBoxV3Read(ctx);
  const runCount = await db.syncRun.count({ where: { organizationId: ctx.organizationId } });
  const pageCount = Math.max(1, Math.ceil(runCount / 40));
  const runPage = Math.min(pageCount, Math.max(1, Number.isSafeInteger(input.runPage) ? input.runPage! : 1));
  const [runs, evidence, alerts, active, withProblems, openAlerts] = await Promise.all([
    db.syncRun.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { startedAt: "desc" }, take: 40, skip: (runPage - 1) * 40, select: { id: true, sourceKind: true, status: true, trigger: true, startedAt: true, finishedAt: true, fetched: true, createdCount: true, duplicateCount: true, skippedCount: true, pages: true, coverage: true } }),
    db.connectorEvidence.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { checkedAt: "desc" }, take: 40, select: { id: true, connectorKey: true, courtCode: true, operation: true, environment: true, outcome: true, reasonCode: true, checkedAt: true } }),
    db.healthAlert.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { lastSeenAt: "desc" }, take: 40, select: { id: true, code: true, severity: true, state: true, occurrences: true, firstSeenAt: true, lastSeenAt: true, acknowledgedAt: true, resolvedAt: true } }),
    db.syncRun.count({ where: { organizationId: ctx.organizationId, status: "RUNNING" } }),
    db.syncRun.count({ where: { organizationId: ctx.organizationId, status: { in: ["FAILED", "PARTIAL"] } } }),
    db.healthAlert.count({ where: { organizationId: ctx.organizationId, state: "OPEN" } }),
  ]);
  return { runs, evidence, alerts, active, withProblems, openAlerts, runCount, runPage, pageCount };
}

/** Detalhe operacional sanitizado de uma execução histórica: sem cursor ou mensagem bruta de erro. */
export async function getBoxV3SyncRun(ctx: TenantContext, id: string) {
  assertBoxV3Read(ctx);
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Execução não encontrada.");
  const run = await db.syncRun.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, sourceKind: true, status: true, trigger: true, startedAt: true, heartbeatAt: true, finishedAt: true, windowFrom: true, windowTo: true, pages: true, fetched: true, reportedTotal: true, createdCount: true, duplicateCount: true, skippedCount: true, errorCode: true, coverage: true, sourceId: true },
  });
  if (!run) throw new NotFoundError("Execução não encontrada.");
  const [evidence, alerts] = await Promise.all([
    db.connectorEvidence.findMany({ where: { organizationId: ctx.organizationId, runId: id }, orderBy: { checkedAt: "desc" }, take: 50, select: { connectorKey: true, courtCode: true, operation: true, environment: true, outcome: true, reasonCode: true, checkedAt: true } }),
    db.healthAlert.findMany({ where: { organizationId: ctx.organizationId, sourceKind: run.sourceKind, sourceId: run.sourceId }, orderBy: { lastSeenAt: "desc" }, take: 20, select: { code: true, severity: true, state: true, occurrences: true, lastSeenAt: true } }),
  ]);
  return {
    run: { id: run.id, sourceKind: run.sourceKind, status: run.status, trigger: run.trigger, startedAt: run.startedAt, lastActivityAt: run.status === "RUNNING" ? run.heartbeatAt : null, finishedAt: run.finishedAt, windowFrom: run.windowFrom, windowTo: run.windowTo, pages: run.pages, fetched: run.fetched, reportedTotal: run.reportedTotal, createdCount: run.createdCount, duplicateCount: run.duplicateCount, skippedCount: run.skippedCount, hasInternalError: Boolean(run.errorCode), coverage: run.coverage },
    evidence,
    alerts,
  };
}

/** Fecha somente o registro interno sem heartbeat pelo mesmo limite usado pelo motor; não retoma nem aciona a fonte. */
export async function markBoxV3SyncRunInterrupted(ctx: TenantContext, id: string) {
  if (!ctx.permissions.has("integrations:manage")) throw new ForbiddenError();
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Execução não encontrada.");
  const now = new Date();
  const cutoff = new Date(now.getTime() - RUN_HEARTBEAT_TIMEOUT_MIN * 60_000);
  await db.$transaction(async (tx) => {
  const result = await tx.syncRun.updateMany({
    where: { id, organizationId: ctx.organizationId, status: "RUNNING", heartbeatAt: { lt: cutoff } },
    data: { status: "INTERRUPTED", finishedAt: now, errorCode: "INTERRUPTED", errorMessage: "A execução foi marcada como interrompida por falta de sinal de vida." },
  });
  if (result.count !== 1) throw new ConflictError(`A execução não está parada há mais de ${RUN_HEARTBEAT_TIMEOUT_MIN} minutos ou já mudou de estado. Atualize a página.`);
  await audit({ action: "sync_run.mark_interrupted", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "sync_run", resourceId: id, metadata: { boxVersion: "3.0", thresholdMinutes: RUN_HEARTBEAT_TIMEOUT_MIN }, meta: ctx.meta }, tx);
  });
}

/** Reconhece o alerta apenas dentro do LegalOS; não consulta nem altera uma fonte judicial. */
export async function acknowledgeBoxV3HealthAlert(ctx: TenantContext, id: string) {
  if (!ctx.permissions.has("integrations:manage")) throw new ForbiddenError();
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Alerta não encontrado.");
  await db.$transaction(async (tx) => {
    const changed = await tx.healthAlert.updateMany({ where: { id, organizationId: ctx.organizationId, state: "OPEN" }, data: { state: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: ctx.userId } });
    if (changed.count !== 1) throw new NotFoundError("Alerta não encontrado ou já reconhecido.");
    await audit({ action: "health_alert.ack", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "health_alert", resourceId: id, metadata: { boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
}

function assertBoxV3PetitionRead(ctx: TenantContext) {
  if (!ctx.permissions.has("petitions:read")) throw new ForbiddenError();
}

function assertBoxV3PetitionDraftWrite(ctx: TenantContext) {
  if (!ctx.permissions.has("petitions:write") || !ctx.permissions.has("cases:read") || !ctx.permissions.has("documents:read")) throw new ForbiddenError();
}

export async function listBoxV3PetitionCases(ctx: TenantContext, rawQuery = "") {
  assertBoxV3PetitionDraftWrite(ctx);
  const q = rawQuery.trim().slice(0, 80);
  const conditions: Prisma.CaseWhereInput[] = [{ organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)];
  if (q) conditions.push({ OR: [{ number: { contains: q } }, { title: { contains: q, mode: "insensitive" } }] });
  return db.case.findMany({
    where: { AND: conditions },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100,
    select: { id: true, number: true, title: true, court: true },
  });
}

export async function listBoxV3PetitionDocuments(ctx: TenantContext, caseId: string) {
  assertBoxV3PetitionDraftWrite(ctx);
  if (!UUID_PATTERN.test(caseId)) throw new NotFoundError("Processo não encontrado.");
  const visibleCase = await db.case.findFirst({ where: { AND: [{ id: caseId, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true } });
  if (!visibleCase) throw new NotFoundError("Processo não encontrado.");
  return db.document.findMany({ where: { organizationId: ctx.organizationId, caseId, deletedAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100, select: { id: true, name: true, currentVersion: true, mimeType: true, sizeBytes: true } });
}

/** Recibos disponíveis para conferência manual. Não consulta o tribunal. */
export async function listBoxV3PetitionReceiptDocuments(ctx: TenantContext, petitionId: string) {
  if (!ctx.permissions.has("petitions:approve") || !ctx.permissions.has("documents:read")) throw new ForbiddenError();
  if (!UUID_PATTERN.test(petitionId)) throw new NotFoundError("Petição não encontrada.");
  const petition = await db.petitionFiling.findFirst({
    where: { id: petitionId, organizationId: ctx.organizationId, deletedAt: null, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } },
    select: { caseId: true },
  });
  if (!petition) throw new NotFoundError("Petição não encontrada.");
  return db.document.findMany({ where: { organizationId: ctx.organizationId, caseId: petition.caseId, deletedAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100, select: { id: true, name: true } });
}

export async function createBoxV3PetitionDraft(ctx: TenantContext, input: { caseId: string; documentId: string; title: string; kind?: string }) {
  assertBoxV3PetitionDraftWrite(ctx);
  if (!UUID_PATTERN.test(input.caseId) || !UUID_PATTERN.test(input.documentId)) throw new ValidationError("Escolha um processo e um documento válidos.");
  const title = input.title.trim();
  const kind = input.kind?.trim() || null;
  if (title.length < 3 || title.length > 200) throw new ValidationError("O título deve ter de 3 a 200 caracteres.");
  if (kind && kind.length > 80) throw new ValidationError("O tipo pode ter até 80 caracteres.");
  const caseRow = await db.case.findFirst({ where: { AND: [{ id: input.caseId, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true, title: true, court: true } });
  if (!caseRow) throw new NotFoundError("Processo não encontrado.");
  const document = await db.document.findFirst({ where: { id: input.documentId, organizationId: ctx.organizationId, caseId: caseRow.id, deletedAt: null }, select: { id: true, currentVersion: true } });
  if (!document) throw new ValidationError("Escolha um documento do mesmo processo.");
  return db.$transaction(async (tx) => {
    const petition = await tx.petitionFiling.create({ data: { organizationId: ctx.organizationId, caseId: caseRow.id, documentId: document.id, documentVersion: document.currentVersion, title, kind, court: caseRow.court, authorId: ctx.userId, status: "DRAFT" }, select: { id: true } });
    await logCaseEvent(tx, ctx, caseRow.id, { kind: "PETITION_CREATED", title: `Rascunho de petição criado: ${title}` });
    await audit({ action: "petition.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petition.id, metadata: { boxVersion: "3.0", status: "DRAFT" }, meta: ctx.meta }, tx);
    return petition.id;
  });
}

const BOX_V3_ATTACHMENT_CLASSES = ["PROCURACAO", "DOCUMENTO_PESSOAL", "COMPROVANTE_RESIDENCIA", "PROVA_DOCUMENTAL", "CONTRATO", "DECISAO_ANEXA", "OUTROS"] as const;

export async function addBoxV3PetitionDraftAttachment(ctx: TenantContext, petitionId: string, documentId: string, classification: string) {
  assertBoxV3PetitionDraftWrite(ctx);
  if (!UUID_PATTERN.test(petitionId) || !UUID_PATTERN.test(documentId)) throw new NotFoundError("Rascunho ou documento não encontrado.");
  if (!(BOX_V3_ATTACHMENT_CLASSES as readonly string[]).includes(classification)) throw new ValidationError("Escolha uma classificação válida para o documento.");
  const petition = await db.petitionFiling.findFirst({ where: { id: petitionId, organizationId: ctx.organizationId, deletedAt: null, status: "DRAFT", case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } }, select: { id: true, caseId: true, documentId: true } });
  if (!petition) throw new NotFoundError("Rascunho não encontrado.");
  if (documentId === petition.documentId) throw new ValidationError("O documento principal já está incluído.");
  const document = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId, caseId: petition.caseId, deletedAt: null }, select: { id: true, currentVersion: true } });
  if (!document) throw new ValidationError("Escolha um documento do mesmo processo.");
  const existing = await db.petitionAttachment.findMany({ where: { petitionId, organizationId: ctx.organizationId }, select: { position: true } });
  if (existing.length >= 20) throw new ValidationError("O rascunho aceita até 20 anexos.");
  try {
    await db.$transaction(async (tx) => {
      await tx.petitionAttachment.create({ data: { organizationId: ctx.organizationId, petitionId, documentId, documentVersion: document.currentVersion, classification, position: existing.reduce((max, item) => Math.max(max, item.position), 0) + 1, createdById: ctx.userId } });
      await audit({ action: "petition.attachment_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petitionId, metadata: { classification, boxVersion: "3.0" }, meta: ctx.meta }, tx);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("Este documento já está anexado ao rascunho.");
    throw error;
  }
}

export async function removeBoxV3PetitionDraftAttachment(ctx: TenantContext, petitionId: string, attachmentId: string) {
  assertBoxV3PetitionDraftWrite(ctx);
  if (!UUID_PATTERN.test(petitionId) || !UUID_PATTERN.test(attachmentId)) throw new NotFoundError("Anexo não encontrado.");
  const petition = await db.petitionFiling.findFirst({ where: { id: petitionId, organizationId: ctx.organizationId, deletedAt: null, status: "DRAFT", case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } }, select: { id: true } });
  if (!petition) throw new NotFoundError("Rascunho não encontrado.");
  await db.$transaction(async (tx) => {
    const removed = await tx.petitionAttachment.deleteMany({ where: { id: attachmentId, petitionId: petition.id, organizationId: ctx.organizationId } });
    if (removed.count !== 1) throw new NotFoundError("Anexo não encontrado.");
    await audit({ action: "petition.attachment_remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petition.id, metadata: { boxVersion: "3.0" }, meta: ctx.meta }, tx);
  });
}

export async function getBoxV3Petition(ctx: TenantContext, id: string) {
  assertBoxV3PetitionRead(ctx);
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Petição não encontrada.");
  const petition = await db.petitionFiling.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } },
    select: { id: true, title: true, kind: true, status: true, court: true, documentVersion: true, reviewNote: true, authorId: true, reviewerId: true, reviewedAt: true, updatedAt: true, scheduledFor: true, submittedAt: true, confirmedAt: true, unknownSince: true, case: { select: { id: true, title: true, number: true } }, document: { select: { id: true, name: true, currentVersion: true, deletedAt: true, mimeType: true, sizeBytes: true } }, attachments: { orderBy: { position: "asc" }, select: { id: true, classification: true, documentVersion: true, document: { select: { id: true, name: true, currentVersion: true, deletedAt: true } } } } },
  });
  if (!petition) throw new NotFoundError("Petição não encontrada.");
  return { ...petition, staleDocument: petition.document.currentVersion !== petition.documentVersion, documentRemoved: petition.document.deletedAt !== null };
}

/** Internal review workflow only. Approval changes the LegalOS state; it never schedules or submits. */
export async function requestBoxV3PetitionReview(ctx: TenantContext, id: string) {
  assertBoxV3PetitionDraftWrite(ctx);
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Rascunho não encontrado.");
  const petition = await db.petitionFiling.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, status: "DRAFT", case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } },
    select: { id: true, caseId: true, title: true, documentVersion: true, case: { select: { confidential: true, members: { select: { userId: true } } } }, document: { select: { id: true, currentVersion: true, deletedAt: true } }, attachments: { select: { id: true, documentVersion: true, document: { select: { currentVersion: true, deletedAt: true } } } } },
  });
  if (!petition) throw new NotFoundError("Rascunho não encontrado.");
  if (petition.document.deletedAt) throw new ConflictError("O documento principal foi removido.");
  if (petition.attachments.some((attachment) => attachment.document.deletedAt)) throw new ConflictError("Remova os anexos que foram excluídos antes de enviar para revisão.");
  const at = new Date();
  await db.$transaction(async (tx) => {
    const changed = await tx.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: "DRAFT", deletedAt: null }, data: { status: "IN_REVIEW", scheduledFor: null, scheduledById: null, scheduleNote: null, documentVersion: petition.document.currentVersion, reviewNote: null, reviewerId: null, reviewedAt: null } });
    if (changed.count !== 1) throw new ConflictError("O rascunho mudou. Atualize a página antes de enviar para revisão.");
    for (const attachment of petition.attachments) await tx.petitionAttachment.update({ where: { id: attachment.id }, data: { documentVersion: attachment.document.currentVersion } });
    await logCaseEvent(tx, ctx, petition.caseId, { kind: "PETITION_REVIEW", title: `Petição enviada para revisão: ${petition.title}` });
    await audit({ action: "petition.request_review", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petition.id, metadata: { boxVersion: "3.0", status: "IN_REVIEW", reviewedVersionAt: at.toISOString() }, meta: ctx.meta }, tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const approvers = await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", userId: { not: ctx.userId }, user: { disabledAt: null }, role: { permissions: { has: "petitions:approve" } }, ...(petition.case.confidential ? { OR: [{ role: { permissions: { has: "organization:manage" } } }, { userId: { in: petition.case.members.map(({ userId }) => userId) } }] } : {}) }, select: { userId: true } });
  await notify(approvers.map(({ userId }) => ({ organizationId: ctx.organizationId, userId, kind: "petition.review", title: "Petição aguardando revisão", body: petition.title, link: `/box-v3/peticionamento/${petition.id}`, dedupeKey: `petition.review.v3:${petition.id}:${Date.now()}` })));
}

export async function approveBoxV3Petition(ctx: TenantContext, id: string) {
  if (!ctx.permissions.has("petitions:approve") || !ctx.permissions.has("documents:read")) throw new ForbiddenError();
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Petição não encontrada.");
  const petition = await db.petitionFiling.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null, status: "IN_REVIEW", case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } }, select: { id: true, caseId: true, title: true, documentVersion: true, document: { select: { currentVersion: true, deletedAt: true } }, attachments: { select: { documentVersion: true, document: { select: { currentVersion: true, deletedAt: true } } } } } });
  if (!petition) throw new NotFoundError("Petição em revisão não encontrada.");
  if (petition.document.deletedAt || petition.document.currentVersion !== petition.documentVersion) throw new ConflictError("O documento principal foi removido ou mudou após o envio para revisão. Devolva ao rascunho e envie novamente.");
  if (petition.attachments.some((attachment) => attachment.document.deletedAt || attachment.document.currentVersion !== attachment.documentVersion)) throw new ConflictError("Um anexo foi removido ou mudou após o envio para revisão. Devolva ao rascunho e envie novamente.");
  await db.$transaction(async (tx) => {
    const changed = await tx.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: "IN_REVIEW", deletedAt: null }, data: { status: "APPROVED", scheduledFor: null, scheduledById: null, scheduleNote: null, reviewerId: ctx.userId, reviewedAt: new Date(), reviewNote: null } });
    if (changed.count !== 1) throw new ConflictError("A petição mudou de situação. Atualize a página.");
    await logCaseEvent(tx, ctx, petition.caseId, { kind: "PETITION_APPROVED", title: `Petição aprovada internamente: ${petition.title}` });
    await audit({ action: "petition.approve", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petition.id, metadata: { boxVersion: "3.0", status: "APPROVED", internalOnly: true }, meta: ctx.meta }, tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function returnBoxV3PetitionToDraft(ctx: TenantContext, id: string, rawNote: string) {
  if (!ctx.permissions.has("petitions:approve")) throw new ForbiddenError();
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Petição não encontrada.");
  const note = rawNote.trim();
  if (note.length < 3 || note.length > 1000) throw new ValidationError("Informe um motivo com 3 a 1000 caracteres.");
  const petition = await db.petitionFiling.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null, status: { in: ["IN_REVIEW", "APPROVED"] }, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } }, select: { id: true, caseId: true, title: true, authorId: true, status: true, case: { select: { confidential: true, members: { select: { userId: true } } } } } });
  if (!petition) throw new NotFoundError("Petição não encontrada.");
  await db.$transaction(async (tx) => {
    const changed = await tx.petitionFiling.updateMany({ where: { id, organizationId: ctx.organizationId, status: petition.status, deletedAt: null }, data: { status: "DRAFT", scheduledFor: null, scheduledById: null, scheduleNote: null, reviewerId: ctx.userId, reviewedAt: new Date(), reviewNote: note } });
    if (changed.count !== 1) throw new ConflictError("A petição mudou de situação. Atualize a página.");
    await logCaseEvent(tx, ctx, petition.caseId, { kind: "PETITION_RETURNED", title: `Petição devolvida para ajustes: ${petition.title}`, description: note });
    await audit({ action: "petition.return", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petition.id, metadata: { boxVersion: "3.0", from: petition.status, to: "DRAFT" }, meta: ctx.meta }, tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (petition.authorId && petition.authorId !== ctx.userId) {
    const author = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: petition.authorId, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "petitions:read" } }, ...(petition.case.confidential ? { OR: [{ role: { permissions: { has: "organization:manage" } } }, { userId: { in: petition.case.members.map(({ userId }) => userId) } }] } : {}) }, select: { userId: true } });
    if (author) await notify({ organizationId: ctx.organizationId, userId: author.userId, kind: "petition.returned", title: "Petição devolvida para ajustes", body: petition.title, link: `/box-v3/peticionamento/${petition.id}`, dedupeKey: `petition.returned.v3:${petition.id}:${Date.now()}` });
  }
}

/** Cancels only an internal-stage filing and preserves its material in a new draft. */
export async function cancelBoxV3PetitionAndCopyDraft(ctx: TenantContext, id: string) {
  assertBoxV3PetitionDraftWrite(ctx);
  if (!UUID_PATTERN.test(id)) throw new NotFoundError("Petição não encontrada.");
  const petition = await db.petitionFiling.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null, status: { in: ["DRAFT", "IN_REVIEW", "APPROVED"] }, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } }, select: { id: true, caseId: true, documentId: true, documentVersion: true, title: true, kind: true, court: true, status: true, attachments: { orderBy: { position: "asc" }, select: { documentId: true, documentVersion: true, classification: true, position: true } } } });
  if (!petition) throw new NotFoundError("Petição interna não encontrada.");
  const draftId = await db.$transaction(async (tx) => {
    const changed = await tx.petitionFiling.updateMany({ where: { id: petition.id, organizationId: ctx.organizationId, status: petition.status, deletedAt: null }, data: { status: "CANCELED", scheduledFor: null, scheduledById: null, scheduleNote: null } });
    if (changed.count !== 1) throw new ConflictError("A petição mudou de situação. Atualize a página.");
    const copy = await tx.petitionFiling.create({ data: { organizationId: ctx.organizationId, caseId: petition.caseId, documentId: petition.documentId, documentVersion: petition.documentVersion, title: petition.title, kind: petition.kind, court: petition.court, authorId: ctx.userId, status: "DRAFT" }, select: { id: true } });
    for (const attachment of petition.attachments) await tx.petitionAttachment.create({ data: { organizationId: ctx.organizationId, petitionId: copy.id, documentId: attachment.documentId, documentVersion: attachment.documentVersion, classification: attachment.classification, position: attachment.position, createdById: ctx.userId } });
    await logCaseEvent(tx, ctx, petition.caseId, { kind: "PETITION_CANCELED", title: `Petição cancelada e copiada para novo rascunho: ${petition.title}` });
    await logCaseEvent(tx, ctx, petition.caseId, { kind: "PETITION_CREATED", title: `Novo rascunho copiado da petição cancelada: ${petition.title}` });
    await audit({ action: "petition.cancel_copy", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petition.id, metadata: { boxVersion: "3.0", from: petition.status, copyId: copy.id }, meta: ctx.meta }, tx);
    await audit({ action: "petition.copy_draft", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: copy.id, metadata: { boxVersion: "3.0", sourceId: petition.id }, meta: ctx.meta }, tx);
    return copy.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return draftId;
}

export async function updateBoxV3PetitionDraft(ctx: TenantContext, id: string, input: { documentId: string; title: string; kind?: string }) {
  assertBoxV3PetitionDraftWrite(ctx);
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(input.documentId)) throw new NotFoundError("Petição não encontrada.");
  const petition = await db.petitionFiling.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null, status: "DRAFT", case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } }, select: { id: true, caseId: true, case: { select: { court: true } } } });
  if (!petition) throw new NotFoundError("Rascunho não encontrado.");
  const title = input.title.trim();
  const kind = input.kind?.trim() || null;
  if (title.length < 3 || title.length > 200) throw new ValidationError("O título deve ter de 3 a 200 caracteres.");
  if (kind && kind.length > 80) throw new ValidationError("O tipo pode ter até 80 caracteres.");
  const document = await db.document.findFirst({ where: { id: input.documentId, organizationId: ctx.organizationId, caseId: petition.caseId, deletedAt: null }, select: { id: true, currentVersion: true } });
  if (!document) throw new ValidationError("Escolha um documento do mesmo processo.");
  const changed = await db.petitionFiling.updateMany({ where: { id: petition.id, organizationId: ctx.organizationId, status: "DRAFT", deletedAt: null }, data: { title, kind, documentId: document.id, documentVersion: document.currentVersion, court: petition.case.court } });
  if (changed.count !== 1) throw new ConflictError("O rascunho mudou. Atualize a página antes de salvar.");
  await audit({ action: "petition.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: petition.id, metadata: { boxVersion: "3.0", status: "DRAFT" }, meta: ctx.meta });
}

/** Fila de protocolos antiga exposta como histórico. Nenhuma função de envio ou serviço com efeitos colaterais é chamado. */
export async function getBoxV3PetitionQueue(ctx: TenantContext) {
  assertBoxV3PetitionRead(ctx);
  const where: Prisma.PetitionFilingWhereInput = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } },
  };
  const [items, grouped] = await Promise.all([
    db.petitionFiling.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, status: true, isDemo: true, filingEnvironment: true, protocol: true, receipt: true, error: true, scheduledFor: true, updatedAt: true, submittedAt: true, confirmedAt: true, unknownSince: true, case: { select: { id: true, title: true, number: true } } },
    }),
    db.petitionFiling.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  return { items: items.map(({ receipt, error, ...item }) => ({ ...item, hasReceipt: Boolean(receipt), hasError: Boolean(error) })), counts: Object.fromEntries(grouped.map((group) => [group.status, group._count._all])) as Record<string, number> };
}

/** Lotes de importação em modo histórico: não dispara consulta nem download. */
export async function getBoxV3Imports(ctx: TenantContext) {
  if (!ctx.permissions.has("cases:read")) throw new ForbiddenError();
  const batches = await db.caseImportBatch.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, createdAt: true, items: { orderBy: { position: "asc" }, take: 200, select: { id: true, number: true, createStatus: true, syncStatus: true, autosStatus: true, caseId: true } } },
  });
  const linkedIds = [...new Set(batches.flatMap((batch) => batch.items.map((item) => item.caseId).filter((id): id is string => Boolean(id))))];
  const visibleCases = linkedIds.length ? await db.case.findMany({ where: { AND: [{ id: { in: linkedIds }, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true } }) : [];
  const visibleIds = new Set(visibleCases.map((item) => item.id));
  return batches.map((batch) => ({ ...batch, items: batch.items.filter((item) => !item.caseId || visibleIds.has(item.caseId)), hasHiddenItems: batch.items.some((item) => Boolean(item.caseId && !visibleIds.has(item.caseId))) }));
}
