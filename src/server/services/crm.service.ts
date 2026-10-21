import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { onlyDigits, normalizeDocument } from "@/lib/validation/br-documents";
import { parseMoneyBR } from "@/lib/validation/money";
import { ymdToDate, todayYmd } from "@/lib/dates/ymd";
import { activitySchema, leadSchema, LEAD_STAGES, OPEN_STAGES, proposalSchema, type ActivityInput, type LeadInput, type ProposalInput } from "@/modules/crm/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { isUniqueViolation } from "./db-errors";
import { userNames } from "./members";
import { runWorkflows } from "./workflow.service";

const UUID = /^[0-9a-f-]{36}$/i;

async function assertOwnerActive(ctx: TenantContext, ownerId: string) {
  const m = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: ownerId, status: "ACTIVE" }, select: { id: true } });
  if (!m) throw new ValidationError("Responsável inválido.", { ownerId: ["Escolha um membro ativo do escritório."] });
}

function toData(i: LeadInput) {
  return {
    name: i.name.trim(),
    type: i.type,
    email: i.email.trim().toLowerCase() || null,
    phone: onlyDigits(i.phone) || null,
    source: i.source.trim() || null,
    interest: i.interest.trim() || null,
    estimatedValue: i.estimatedValue ? parseMoneyBR(i.estimatedValue) : null,
    ownerId: i.ownerId || null,
    nextActionDate: i.nextActionDate ? ymdToDate(i.nextActionDate) : null,
    notes: i.notes.trim() || null,
  };
}

export type LeadFilters = { q?: string; stage?: string; ownerId?: string };

export async function listLeads(ctx: TenantContext, f: LeadFilters = {}) {
  assertCan(ctx, "crm:read");
  const q = f.q?.trim().slice(0, 80);
  const where: Prisma.LeadWhereInput = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    ...(f.stage && (LEAD_STAGES as readonly string[]).includes(f.stage) ? { stage: f.stage as (typeof LEAD_STAGES)[number] } : {}),
    ...(f.ownerId && UUID.test(f.ownerId) ? { ownerId: f.ownerId } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { interest: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [items, total, sums] = await Promise.all([
    db.lead.findMany({ where, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true, name: true, type: true, stage: true, estimatedValue: true, interest: true, ownerId: true, nextActionDate: true, updatedAt: true } }),
    db.lead.count({ where }),
    db.lead.groupBy({ by: ["stage"], where: { organizationId: ctx.organizationId, deletedAt: null }, _count: { _all: true }, _sum: { estimatedValue: true } }),
  ]);
  const names = await userNames(ctx, items.map((i) => i.ownerId));
  return { items: items.map((i) => ({ ...i, ownerName: i.ownerId ? (names.get(i.ownerId) ?? null) : null })), total, truncated: total > items.length, summary: sums };
}

export async function getLead(ctx: TenantContext, id: string) {
  assertCan(ctx, "crm:read");
  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      proposals: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) throw new NotFoundError("Lead não encontrado.");
  const names = await userNames(ctx, [lead.ownerId, lead.createdById, ...lead.activities.map((a) => a.createdById)]);
  return { lead, names };
}

export async function createLead(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "crm:write");
  const data = toData(leadSchema.parse(raw));
  if (data.ownerId) await assertOwnerActive(ctx, data.ownerId);
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.create({ data: { ...data, ownerId: data.ownerId ?? ctx.userId, organizationId: ctx.organizationId, createdById: ctx.userId } });
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId: lead.id, kind: "SYSTEM", body: "Lead cadastrado.", createdById: ctx.userId } });
    await audit({ action: "lead.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "lead", resourceId: lead.id, meta: ctx.meta }, tx);
    return lead;
  });
}

async function loadOpen(ctx: TenantContext, id: string) {
  const l = await db.lead.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!l) throw new NotFoundError("Lead não encontrado.");
  return l;
}

export async function updateLead(ctx: TenantContext, id: string, raw: unknown) {
  assertCan(ctx, "crm:write");
  const data = toData(leadSchema.parse(raw));
  if (data.ownerId) await assertOwnerActive(ctx, data.ownerId);
  const res = await db.lead.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data });
  if (res.count === 0) throw new NotFoundError("Lead não encontrado.");
  await audit({ action: "lead.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "lead", resourceId: id, meta: ctx.meta });
}

/** Mover entre etapas abertas. Ganho e perdido têm ações próprias (conversão e motivo). */
export async function changeLeadStage(ctx: TenantContext, id: string, stage: string) {
  assertCan(ctx, "crm:write");
  if (!(OPEN_STAGES as readonly string[]).includes(stage)) throw new ValidationError("Etapa inválida. Use a conversão em cliente (ganho) ou informe o motivo (perdido).");
  const lead = await loadOpen(ctx, id);
  if (lead.stage === stage) return;
  await db.$transaction(async (tx) => {
    const res = await tx.lead.updateMany({
      where: { id, organizationId: ctx.organizationId, deletedAt: null, stage: { in: [...OPEN_STAGES] } },
      data: { stage: stage as (typeof OPEN_STAGES)[number] },
    });
    if (res.count === 0) throw new ConflictError("O lead já foi encerrado (ganho ou perdido). Reabra-o para mover.");
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId: id, kind: "STAGE", body: `Etapa: ${lead.stage} → ${stage}`, createdById: ctx.userId } });
    await audit({ action: "lead.stage", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "lead", resourceId: id, metadata: { from: lead.stage, to: stage }, meta: ctx.meta }, tx);
  });
}

export async function markLeadLost(ctx: TenantContext, id: string, reason: string) {
  assertCan(ctx, "crm:write");
  const r = reason.trim();
  if (r.length < 3) throw new ValidationError("Informe o motivo.", { reason: ["Informe o motivo da perda."] });
  if (r.length > 500) throw new ValidationError("Texto muito longo.", { reason: ["Máximo de 500 caracteres."] });
  await db.$transaction(async (tx) => {
    const res = await tx.lead.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null, stage: { in: [...OPEN_STAGES] } }, data: { stage: "LOST", lostReason: r, closedAt: new Date() } });
    if (res.count === 0) throw new ConflictError("O lead não está em andamento.");
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId: id, kind: "STAGE", body: `Perdido: ${r}`, createdById: ctx.userId } });
    await audit({ action: "lead.lost", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "lead", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function reopenLead(ctx: TenantContext, id: string) {
  assertCan(ctx, "crm:write");
  await db.$transaction(async (tx) => {
    const res = await tx.lead.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null, stage: "LOST" }, data: { stage: "NEW", lostReason: null, closedAt: null } });
    if (res.count === 0) throw new ConflictError("Só leads perdidos podem ser reabertos.");
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId: id, kind: "STAGE", body: "Lead reaberto.", createdById: ctx.userId } });
    await audit({ action: "lead.reopen", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "lead", resourceId: id, meta: ctx.meta }, tx);
  });
}

export async function addLeadActivity(ctx: TenantContext, id: string, raw: ActivityInput) {
  assertCan(ctx, "crm:write");
  const v = activitySchema.parse(raw);
  await loadOpen(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId: id, kind: v.kind, body: v.body, createdById: ctx.userId } });
    await tx.lead.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { updatedAt: new Date() } });
  });
}

/**
 * Converte o lead em cliente (ganho). Tudo em uma transação: o cliente nasce com status ATIVO,
 * o lead passa a GANHO e fica vinculado ao cliente. Documento (CPF/CNPJ) é opcional, validado e único.
 */
export async function convertLead(ctx: TenantContext, id: string, rawDocument: string) {
  assertCan(ctx, "crm:write");
  assertCan(ctx, "clients:write");
  const lead = await loadOpen(ctx, id);
  if (lead.stage === "WON" || lead.stage === "LOST") throw new ConflictError("O lead já foi encerrado.");
  const docInput = rawDocument.trim();
  let document: string | null = null;
  if (docInput) {
    document = normalizeDocument(lead.type, docInput);
    if (!document) throw new ValidationError(lead.type === "PERSON" ? "CPF inválido." : "CNPJ inválido.", { document: [lead.type === "PERSON" ? "CPF inválido." : "CNPJ inválido."] });
    const dup = await db.client.findFirst({ where: { organizationId: ctx.organizationId, document, deletedAt: null }, select: { name: true } });
    if (dup) throw new ConflictError(`Já existe um cliente com este documento neste escritório: ${dup.name}.`);
  }
  let clientId: string;
  try {
    clientId = await db.$transaction(async (tx) => {
      const claimed = await tx.lead.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null, stage: { in: [...OPEN_STAGES] }, clientId: null }, data: { stage: "NEW" } });
      if (claimed.count === 0) throw new ConflictError("O lead já foi encerrado.");
      const client = await tx.client.create({
        data: {
          organizationId: ctx.organizationId,
          type: lead.type,
          status: "ACTIVE",
          name: lead.name,
          document,
          email: lead.email,
          phone: lead.phone,
          notes: lead.notes ? `Origem: lead. ${lead.notes}`.slice(0, 4000) : "Origem: lead do CRM.",
          tags: [],
          createdById: ctx.userId,
        },
      });
      await tx.lead.update({ where: { id }, data: { stage: "WON", clientId: client.id, closedAt: new Date() } });
      await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId: id, kind: "STAGE", body: "Ganho: convertido em cliente.", createdById: ctx.userId } });
      await audit({ action: "lead.convert", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "lead", resourceId: id, metadata: { clientId: client.id }, meta: ctx.meta }, tx);
      return client.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe um cliente com este documento neste escritório.");
    throw err;
  }
  // Chat: as conversas do lead passam a pertencer ao novo cliente.
  await db.whatsappConversation.updateMany({ where: { organizationId: ctx.organizationId, leadId: id, clientId: null }, data: { clientId } });
  await runWorkflows(ctx, "LEAD_WON", { type: "lead", id, userId: ctx.userId, label: lead.name, baseDate: todayYmd(ctx.timezone), clientId });
  return { clientId };
}

export async function deleteLead(ctx: TenantContext, id: string) {
  assertCan(ctx, "crm:write");
  const lead = await loadOpen(ctx, id);
  if (lead.clientId) throw new ConflictError("O lead foi convertido em cliente e não pode ser excluído.");
  await db.$transaction(async (tx) => {
    await tx.lead.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { deletedAt: new Date() } });
    await audit({ action: "lead.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "lead", resourceId: id, meta: ctx.meta }, tx);
  });
}

// ---------- propostas ----------

function proposalData(i: ProposalInput) {
  return { title: i.title.trim(), amount: parseMoneyBR(i.amount)!, description: i.description.trim() || null, validUntil: i.validUntil ? ymdToDate(i.validUntil) : null };
}

export async function createProposal(ctx: TenantContext, leadId: string, raw: unknown) {
  assertCan(ctx, "crm:write");
  const data = proposalData(proposalSchema.parse(raw));
  const lead = await loadOpen(ctx, leadId);
  if (lead.stage === "WON" || lead.stage === "LOST") throw new ConflictError("O lead está encerrado.");
  return db.$transaction(async (tx) => {
    const p = await tx.proposal.create({ data: { ...data, organizationId: ctx.organizationId, leadId, createdById: ctx.userId } });
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId, kind: "PROPOSAL", body: `Proposta criada: ${p.title}`, createdById: ctx.userId } });
    await audit({ action: "proposal.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "proposal", resourceId: p.id, meta: ctx.meta }, tx);
    return p;
  });
}

async function loadProposal(ctx: TenantContext, id: string) {
  const p = await db.proposal.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
  if (!p) throw new NotFoundError("Proposta não encontrada.");
  return p;
}

export async function updateProposal(ctx: TenantContext, id: string, raw: unknown) {
  assertCan(ctx, "crm:write");
  const data = proposalData(proposalSchema.parse(raw));
  const p = await loadProposal(ctx, id);
  const res = await db.proposal.updateMany({ where: { id, organizationId: ctx.organizationId, status: "DRAFT", deletedAt: null }, data });
  if (res.count === 0) throw new ConflictError("Só propostas em rascunho podem ser editadas.");
  await audit({ action: "proposal.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "proposal", resourceId: p.id, meta: ctx.meta });
  return p.leadId;
}

async function proposalStep(ctx: TenantContext, id: string, from: "DRAFT" | "SENT", to: "SENT" | "ACCEPTED" | "REJECTED", label: string) {
  assertCan(ctx, "crm:write");
  const p = await loadProposal(ctx, id);
  await db.$transaction(async (tx) => {
    const res = await tx.proposal.updateMany({
      where: { id, organizationId: ctx.organizationId, status: from, deletedAt: null },
      data: to === "SENT" ? { status: "SENT", sentAt: new Date() } : { status: to, decidedAt: new Date() },
    });
    if (res.count === 0) throw new ConflictError("A proposta mudou de situação. Recarregue a página.");
    if (to === "SENT") await tx.lead.updateMany({ where: { id: p.leadId, organizationId: ctx.organizationId, stage: { in: ["NEW", "CONTACTED", "MEETING"] } }, data: { stage: "PROPOSAL" } });
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId: p.leadId, kind: "PROPOSAL", body: `${label}: ${p.title}`, createdById: ctx.userId } });
    await audit({ action: `proposal.${to.toLowerCase()}`, organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "proposal", resourceId: id, meta: ctx.meta }, tx);
  });
  return p.leadId;
}

export const sendProposal = (ctx: TenantContext, id: string) => proposalStep(ctx, id, "DRAFT", "SENT", "Proposta enviada");
export const acceptProposal = (ctx: TenantContext, id: string) => proposalStep(ctx, id, "SENT", "ACCEPTED", "Proposta aceita");
export const rejectProposal = (ctx: TenantContext, id: string) => proposalStep(ctx, id, "SENT", "REJECTED", "Proposta recusada");
