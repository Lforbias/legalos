import type { Prisma } from "@prisma/client";
import { emitWebhookEvent } from "./webhook.service";
import { db, type Tx } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { onlyDigits } from "@/lib/validation/br-documents";
import {
  CASE_STATUS_LABEL,
  createCaseSchema,
  caseSchema,
  noteSchema,
  partySchema,
  toCaseData,
  type CaseInput,
  type CreateCaseInput,
  type NoteInput,
  type PartyInput,
} from "@/modules/cases/schemas";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { PAGE_SIZE } from "./client.service";
import { isUniqueViolation } from "./db-errors";
import { runWorkflows } from "./workflow.service";
import { todayYmd } from "@/lib/dates/ymd";

/**
 * Visibilidade de processos. Processos sigilosos só aparecem para membros da equipe do processo e para quem
 * administra o escritório (`organization:manage`). Aplicada em TODA leitura de processo e de seus filhos.
 */
export function caseVisibility(ctx: TenantContext): Prisma.CaseWhereInput {
  if (can(ctx, "organization:manage")) return {};
  return { OR: [{ confidential: false }, { members: { some: { userId: ctx.userId } } }] };
}

/** Garante que o processo existe NESTE escritório, não foi excluído e é visível ao usuário. Caso contrário, "não encontrado". */
export async function assertCaseVisible(ctx: TenantContext, caseId: string, client: Tx | typeof db = db) {
  const found = await client.case.findFirst({
    where: { AND: [{ id: caseId, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] },
    select: { id: true, number: true, title: true, status: true, confidential: true },
  });
  if (!found) throw new NotFoundError("Processo não encontrado.");
  return found;
}

export type CaseListFilters = {
  q?: string;
  status?: (typeof import("@/modules/cases/schemas").CASE_STATUSES)[number];
  area?: string;
  responsibleId?: string;
  clientId?: string;
  /** 3.0-F1: "only" = só o acervo; padrão = só a carteira ativa (fora do acervo); "all" = tudo. */
  acervo?: "only" | "all";
  page?: number;
  /** Visão em quadro: traz até 200 processos sem paginação. */
  board?: boolean;
};

export async function listCases(ctx: TenantContext, f: CaseListFilters = {}) {
  assertCan(ctx, "cases:read");
  const page = Math.max(1, f.page ?? 1);
  const and: Prisma.CaseWhereInput[] = [{ organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)];
  if (f.status) and.push({ status: f.status });
  if (f.area) and.push({ area: f.area });
  if (f.responsibleId) and.push({ members: { some: { userId: f.responsibleId, role: "RESPONSIBLE" } } });
  if (f.clientId) and.push({ parties: { some: { clientId: f.clientId } } });
  if (f.acervo === "only") and.push({ archivedAt: { not: null } });
  else if (f.acervo !== "all") and.push({ archivedAt: null });
  const q = f.q?.trim().slice(0, 80);
  if (q) {
    const digits = onlyDigits(q);
    const or: Prisma.CaseWhereInput[] = [
      { title: { contains: q, mode: "insensitive" } },
      { legacyNumber: { contains: q, mode: "insensitive" } },
      { parties: { some: { name: { contains: q, mode: "insensitive" } } } },
      // nome atual do cliente (a parte guarda uma cópia do nome na data do vínculo)
      { parties: { some: { client: { name: { contains: q, mode: "insensitive" } } } } },
    ];
    if (digits.length >= 4) {
      // o número é armazenado formatado; procuramos pelos dígitos convertendo no banco
      const ids = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM cases WHERE organization_id = ${ctx.organizationId}::uuid AND deleted_at IS NULL
        AND regexp_replace(coalesce(number, ''), '\\D', '', 'g') LIKE ${`%${digits}%`} LIMIT 200`;
      or.push({ id: { in: ids.map((r) => r.id) } });
    } else if (q.includes(".") || q.includes("-")) or.push({ number: { contains: q } });
    and.push({ OR: or });
  }
  const where: Prisma.CaseWhereInput = { AND: and };
  const take = f.board ? 200 : PAGE_SIZE;
  const [total, rows] = await Promise.all([
    db.case.count({ where }),
    db.case.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: f.board ? 0 : (page - 1) * PAGE_SIZE,
      take,
      select: {
        id: true, number: true, legacyNumber: true, title: true, area: true, court: true, status: true, phase: true, confidential: true, claimValue: true, updatedAt: true, archivedAt: true,
        parties: { where: { isOurClient: true }, select: { name: true, clientId: true, client: { select: { name: true } } }, take: 3 },
        members: { where: { role: "RESPONSIBLE" }, select: { user: { select: { id: true, name: true } } }, take: 1 },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize: take,
    pages: f.board ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE)),
    truncated: f.board ? total > rows.length : false,
    items: rows.map((r) => ({ ...r, responsible: r.members[0]?.user ?? null, members: undefined })),
  };
}

export async function getCase(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:read");
  const c = await db.case.findFirst({
    where: { AND: [{ id, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] },
    include: {
      parties: { orderBy: [{ isOurClient: "desc" }, { createdAt: "asc" }], include: { client: { select: { id: true, name: true, deletedAt: true } } } },
      members: { orderBy: [{ role: "asc" }, { createdAt: "asc" }], include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!c) throw new NotFoundError("Processo não encontrado.");
  return c;
}

/** Processos vinculados a um cliente (respeitando sigilo). */
export async function listCasesForClient(ctx: TenantContext, clientId: string) {
  assertCan(ctx, "cases:read");
  return db.case.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, parties: { some: { clientId } } }, caseVisibility(ctx)] },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, number: true, title: true, status: true, area: true, updatedAt: true },
  });
}

// ---------- utilidades internas ----------

export async function logCaseEvent(
  tx: Tx,
  ctx: TenantContext,
  caseId: string,
  e: { source?: "INTERNAL" | "AUTOMATIC"; kind: string; title: string; description?: string | null; occurredAt?: Date },
) {
  await tx.caseEvent.create({
    data: {
      organizationId: ctx.organizationId,
      caseId,
      source: e.source ?? "AUTOMATIC",
      kind: e.kind,
      title: e.title,
      description: e.description ?? null,
      occurredAt: e.occurredAt ?? new Date(),
      createdById: ctx.userId,
    },
  });
}

export async function assertActiveMember(ctx: TenantContext, userId: string) {
  const m = await db.membership.findFirst({
    where: { organizationId: ctx.organizationId, userId, status: "ACTIVE" },
    select: { user: { select: { name: true } } },
  });
  if (!m) throw new ValidationError("Usuário inválido para este escritório.", { responsibleId: ["Selecione um membro ativo do escritório."] });
  return m.user.name;
}

async function assertNumberFree(ctx: TenantContext, number: string | null, ignoreId?: string) {
  if (!number) return;
  const dup = await db.case.findFirst({
    where: { organizationId: ctx.organizationId, number, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { title: true },
  });
  if (dup) throw new ConflictError(`Já existe um processo com este número neste escritório: ${dup.title}.`);
}

async function setResponsibleTx(tx: Tx, ctx: TenantContext, caseId: string, userId: string) {
  await tx.caseMember.updateMany({ where: { caseId, organizationId: ctx.organizationId, role: "RESPONSIBLE", userId: { not: userId } }, data: { role: "COLLABORATOR" } });
  await tx.caseMember.upsert({
    where: { caseId_userId: { caseId, userId } },
    create: { caseId, userId, organizationId: ctx.organizationId, role: "RESPONSIBLE" },
    update: { role: "RESPONSIBLE" },
  });
}

// ---------- criação / edição ----------

export async function createCase(ctx: TenantContext, raw: CreateCaseInput) {
  assertCan(ctx, "cases:write");
  const input = createCaseSchema.parse(raw);
  const data = toCaseData(input);
  await assertNumberFree(ctx, data.number);
  const responsibleId = input.responsibleId || ctx.userId;
  await assertActiveMember(ctx, responsibleId);

  let client: { id: string; name: string; document: string | null } | null = null;
  if (input.clientId) {
    assertCan(ctx, "clients:read");
    client = await db.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, document: true } });
    if (!client) throw new ValidationError("Cliente não encontrado.", { clientId: ["Selecione um cliente válido."] });
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const c = await tx.case.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId } });
      await tx.caseMember.create({ data: { caseId: c.id, organizationId: ctx.organizationId, userId: responsibleId, role: "RESPONSIBLE" } });
      // quem cadastra sempre mantém acesso (relevante para processos sigilosos)
      if (responsibleId !== ctx.userId) {
        await tx.caseMember.create({ data: { caseId: c.id, organizationId: ctx.organizationId, userId: ctx.userId, role: "COLLABORATOR" } });
      }
      if (client) {
        await tx.caseParty.create({
          data: { caseId: c.id, organizationId: ctx.organizationId, clientId: client.id, role: input.clientRole, name: client.name, document: client.document, isOurClient: true },
        });
      }
      await logCaseEvent(tx, ctx, c.id, { kind: "CASE_CREATED", title: "Processo cadastrado no sistema" });
      await audit(
        { action: "case.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: c.id, metadata: { confidential: c.confidential }, meta: ctx.meta },
        tx,
      );
      return c;
    });
    await emitWebhookEvent(ctx.organizationId, "case.created", { caseId: created.id });
    await runWorkflows(ctx, "CASE_CREATED", { type: "case", id: created.id, userId: ctx.userId, label: created.title, baseDate: todayYmd(ctx.timezone), caseId: created.id, clientId: input.clientId || null });
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe um processo com este número neste escritório.");
    throw err;
  }
}

const FIELD_LABEL: Record<string, string> = {
  number: "número", legacyNumber: "número antigo", title: "título", area: "área", court: "tribunal/órgão", courtUnit: "vara/unidade", courtState: "UF",
  subject: "assunto", claimValue: "valor da causa", phase: "fase", distributedAt: "data de distribuição", confidential: "sigilo", notes: "observações",
};

export async function updateCase(ctx: TenantContext, id: string, raw: CaseInput) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, id);
  const existing = await db.case.findFirstOrThrow({ where: { id, organizationId: ctx.organizationId } });
  const input = caseSchema.parse(raw);
  const data = toCaseData(input);
  await assertNumberFree(ctx, data.number, id);
  if (input.responsibleId) await assertActiveMember(ctx, input.responsibleId);

  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  const changed = (Object.keys(FIELD_LABEL) as (keyof typeof data)[]).filter((k) => norm(data[k]) !== norm(existing[k as keyof typeof existing]));
  const statusChanged = existing.status !== data.status;

  try {
    await db.$transaction(async (tx) => {
      await tx.case.update({ where: { id }, data });
      if (input.responsibleId) {
        const current = await tx.caseMember.findFirst({ where: { caseId: id, role: "RESPONSIBLE" }, select: { userId: true } });
        if (current?.userId !== input.responsibleId) {
          await setResponsibleTx(tx, ctx, id, input.responsibleId);
          await logCaseEvent(tx, ctx, id, { kind: "RESPONSIBLE_CHANGED", title: "Responsável alterado" });
        }
      }
      if (changed.length) {
        await logCaseEvent(tx, ctx, id, { kind: "CASE_UPDATED", title: "Dados do processo atualizados", description: `Campos alterados: ${changed.map((k) => FIELD_LABEL[k]).join(", ")}.` });
      }
      if (statusChanged) {
        await logCaseEvent(tx, ctx, id, {
          kind: "STATUS_CHANGED",
          title: `Situação alterada para "${CASE_STATUS_LABEL[data.status]}"`,
          description: `De "${CASE_STATUS_LABEL[existing.status]}" para "${CASE_STATUS_LABEL[data.status]}".`,
        });
      }
      await audit(
        { action: "case.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: id, metadata: { fields: changed, statusChanged }, meta: ctx.meta },
        tx,
      );
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe um processo com este número neste escritório.");
    throw err;
  }
}

export async function changeCaseStatus(ctx: TenantContext, id: string, status: CaseInput["status"]) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, id);
  const existing = await db.case.findFirstOrThrow({ where: { id, organizationId: ctx.organizationId }, select: { status: true } });
  if (existing.status === status) return;
  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { status } });
    await logCaseEvent(tx, ctx, id, {
      kind: "STATUS_CHANGED",
      title: `Situação alterada para "${CASE_STATUS_LABEL[status]}"`,
      description: `De "${CASE_STATUS_LABEL[existing.status]}" para "${CASE_STATUS_LABEL[status]}".`,
    });
    await audit({ action: "case.status_change", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: id, metadata: { from: existing.status, to: status }, meta: ctx.meta }, tx);
  });
}

/** 3.0-F1: move o processo para o acervo (ou de volta à carteira). Não exclui nada. */
export async function setCaseAcervo(ctx: TenantContext, id: string, inAcervo: boolean) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, id);
  const existing = await db.case.findFirstOrThrow({ where: { id, organizationId: ctx.organizationId }, select: { archivedAt: true } });
  if ((existing.archivedAt !== null) === inAcervo) return;
  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { archivedAt: inAcervo ? new Date() : null } });
    await logCaseEvent(tx, ctx, id, { kind: inAcervo ? "ACERVO_IN" : "ACERVO_OUT", title: inAcervo ? "Processo movido para o acervo" : "Processo devolvido à carteira ativa" });
    await audit({ action: inAcervo ? "case.acervo_in" : "case.acervo_out", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function archiveCase(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:delete");
  await assertCaseVisible(ctx, id);
  await db.case.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "case.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: id, meta: ctx.meta });
}

// ---------- partes ----------

export async function addParty(ctx: TenantContext, caseId: string, raw: PartyInput) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const input = partySchema.parse(raw);
  let name = input.name;
  let document: string | null = input.document ? onlyDigits(input.document) || input.document : null;
  let clientId: string | null = null;
  let registryId: string | null = null;
  const lawyerName: string | null = input.lawyerName || null;
  if (input.registryId && !input.clientId) {
    const reg = await db.partyRegistry.findFirst({ where: { id: input.registryId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, document: true } });
    if (!reg) throw new ValidationError("Parte não encontrada no cadastro.", { registryId: ["Selecione uma parte válida."] });
    const dup = await db.caseParty.findFirst({ where: { caseId, registryId: reg.id }, select: { id: true } });
    if (dup) throw new ConflictError("Esta parte já está neste processo.");
    registryId = reg.id;
    name = reg.name;
    document = reg.document;
  } else if (input.clientId) {
    assertCan(ctx, "clients:read");
    const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, document: true } });
    if (!client) throw new ValidationError("Cliente não encontrado.", { clientId: ["Selecione um cliente válido."] });
    const dup = await db.caseParty.findFirst({ where: { caseId, clientId: client.id }, select: { id: true } });
    if (dup) throw new ConflictError("Este cliente já é parte neste processo.");
    clientId = client.id;
    name = client.name;
    document = client.document;
  }
  const party = await db.$transaction(async (tx) => {
    if (!clientId && !registryId && input.saveToRegistry) {
      const existing = document ? await tx.partyRegistry.findFirst({ where: { organizationId: ctx.organizationId, deletedAt: null, document }, select: { id: true } }) : null;
      registryId = existing?.id ?? (await tx.partyRegistry.create({ data: { organizationId: ctx.organizationId, createdById: ctx.userId, kind: document && document.length === 14 ? "COMPANY" : "PERSON", name, document } })).id;
    }
    const p = await tx.caseParty.create({
      data: { caseId, organizationId: ctx.organizationId, clientId, registryId, role: input.role, name, document, lawyerName, isOurClient: clientId !== null },
    });
    await logCaseEvent(tx, ctx, caseId, { kind: "PARTY_ADDED", title: `Parte adicionada: ${name}` });
    await audit({ action: "case.party_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { partyId: p.id }, meta: ctx.meta }, tx);
    return p;
  });
  return party;
}

export async function removeParty(ctx: TenantContext, caseId: string, partyId: string) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const party = await db.caseParty.findFirst({ where: { id: partyId, caseId, organizationId: ctx.organizationId } });
  if (!party) throw new NotFoundError("Parte não encontrada.");
  await db.$transaction(async (tx) => {
    await tx.caseParty.delete({ where: { id: partyId } });
    await logCaseEvent(tx, ctx, caseId, { kind: "PARTY_REMOVED", title: `Parte removida: ${party.name}` });
    await audit({ action: "case.party_remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { partyId }, meta: ctx.meta }, tx);
  });
}

// ---------- equipe do processo ----------

export async function addCaseMember(ctx: TenantContext, caseId: string, userId: string, role: "RESPONSIBLE" | "COLLABORATOR") {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const name = await assertActiveMember(ctx, userId);
  await db.$transaction(async (tx) => {
    if (role === "RESPONSIBLE") await setResponsibleTx(tx, ctx, caseId, userId);
    else {
      const current = await tx.caseMember.findUnique({ where: { caseId_userId: { caseId, userId } } });
      if (current) throw new ConflictError("Este membro já faz parte da equipe do processo.");
      await tx.caseMember.create({ data: { caseId, userId, organizationId: ctx.organizationId, role } });
    }
    await logCaseEvent(tx, ctx, caseId, {
      kind: role === "RESPONSIBLE" ? "RESPONSIBLE_CHANGED" : "MEMBER_ADDED",
      title: role === "RESPONSIBLE" ? `Responsável definido: ${name}` : `Equipe: ${name} adicionado(a)`,
    });
    await audit({ action: "case.member_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { memberUserId: userId, role }, meta: ctx.meta }, tx);
  });
}

export async function removeCaseMember(ctx: TenantContext, caseId: string, userId: string) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const member = await db.caseMember.findUnique({ where: { caseId_userId: { caseId, userId } }, include: { user: { select: { name: true } } } });
  if (!member || member.organizationId !== ctx.organizationId) throw new NotFoundError("Membro não encontrado na equipe do processo.");
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { confidential: true } });
  if (c.confidential && member.userId === ctx.userId && !can(ctx, "organization:manage")) {
    throw new ForbiddenError("Você não pode se remover de um processo sigiloso, pois perderia o acesso a ele.");
  }
  await db.$transaction(async (tx) => {
    await tx.caseMember.delete({ where: { id: member.id } });
    await logCaseEvent(tx, ctx, caseId, { kind: "MEMBER_REMOVED", title: `Equipe: ${member.user.name} removido(a)` });
    await audit({ action: "case.member_remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { memberUserId: userId }, meta: ctx.meta }, tx);
  });
}

/** Opções para seletores de processo (até 200, respeitando sigilo; exclui arquivados). */
export async function listCaseOptions(ctx: TenantContext) {
  assertCan(ctx, "cases:read");
  return db.case.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, status: { not: "ARCHIVED" } }, caseVisibility(ctx)] },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, title: true, number: true },
  });
}

export async function listAssignableMembers(ctx: TenantContext) {
  assertCan(ctx, "cases:read");
  const rows = await db.membership.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE" },
    orderBy: { user: { name: "asc" } },
    select: { user: { select: { id: true, name: true } } },
  });
  return rows.map((r) => r.user);
}

// ---------- linha do tempo ----------

export async function listCaseEvents(ctx: TenantContext, caseId: string, source?: "IMPORTED" | "INTERNAL" | "AUTOMATIC") {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const events = await db.caseEvent.findMany({
    where: { caseId, organizationId: ctx.organizationId, ...(source ? { source } : {}) },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  const ids = [...new Set(events.map((e) => e.createdById).filter((v): v is string => Boolean(v)))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return events.map((e) => ({ ...e, authorName: e.createdById ? (names.get(e.createdById) ?? null) : null }));
}

/** Anotação interna (registro humano). Andamentos importados de tribunais só existirão a partir da Fase 4/8. */
export async function addCaseNote(ctx: TenantContext, caseId: string, raw: NoteInput) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const input = noteSchema.parse(raw);
  const occurredAt = input.occurredAt ? new Date(`${input.occurredAt}T12:00:00Z`) : new Date();
  if (occurredAt.getTime() > Date.now() + 86_400_000) throw new ValidationError("A data não pode ser futura.", { occurredAt: ["A data não pode ser futura."] });
  await db.$transaction(async (tx) => {
    await logCaseEvent(tx, ctx, caseId, { source: "INTERNAL", kind: "NOTE", title: input.title || "Anotação", description: input.description, occurredAt });
    await audit({ action: "case.note_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, meta: ctx.meta }, tx);
  });
}

