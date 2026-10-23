import { OPERATION_KINDS, OPERATION_SCHEMAS, prepareOperation, executeOperation, type OperationKind } from "./rute-operations.service";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { calculateDeadline } from "@/lib/deadlines/calculator";
import { isYmd } from "@/lib/dates/ymd";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { saveDraftAsDocument, stripUnverifiedCitations } from "./ai-tools.service";
import { addCaseNoteItem } from "./case-note.service";
import { assertCaseVisible, caseVisibility } from "./case.service";
import { createDeadline } from "./deadline.service";
import { createPetition, requestReview } from "./petition.service";
import { assertRuteOn } from "./rute-settings.service";
import { createTask } from "./task.service";

/**
 * 6.0-F3/F9 — propostas da IA. A IA (pelo MCP ou pelo assistente) nunca grava: ela cria uma PROPOSTA em nome da pessoa que a conectou.
 * Uma pessoa vê o que será criado, pode editar e aprova ou recusa. Só na aprovação o dado real é criado, com a permissão de quem aprova.
 * Ações de maior risco (andamento, peça, preparo de protocolo) exigem confirmação explícita extra. NADA é protocolado: o preparo só envia a petição para revisão.
 */

const uuid = z.uuid();
const clip = (max: number) => z.string().trim().max(max);
const ymd = z.string().refine(isYmd, "Data inválida (use AAAA-MM-DD).");

export const KINDS = {
  ...OPERATION_KINDS,
  TASK: { label: "Tarefa", risk: "LOW", permission: "tasks:write" },
  DEADLINE: { label: "Prazo (rascunho)", risk: "LOW", permission: "deadlines:write" },
  NOTE: { label: "Anotação no processo", risk: "LOW", permission: "cases:write" },
  MINUTA: { label: "Minuta (documento do processo)", risk: "LOW", permission: "documents:write" },
  ANDAMENTO: { label: "Andamento anotado no processo", risk: "HIGH", permission: "cases:write" },
  PETICAO: { label: "Petição em rascunho", risk: "HIGH", permission: "petitions:write" },
  PROTOCOLO_PREPARO: { label: "Enviar petição para revisão (preparo de protocolo)", risk: "HIGH", permission: "petitions:write" },
} as const satisfies Record<string, { label: string; risk: "LOW" | "HIGH"; permission: PermissionKey }>;
export type ProposalKind = keyof typeof KINDS;
export const KIND_LIST = Object.keys(KINDS) as ProposalKind[];

export const PROPOSAL_SCHEMAS = {
  ...OPERATION_SCHEMAS,
  TASK: z.object({ title: clip(200).min(3), description: clip(4000).optional().default(""), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"), dueDate: ymd.optional().or(z.literal("")).default(""), assigneeId: uuid.optional().or(z.literal("")).default(""), caseId: uuid.optional().or(z.literal("")).default(""), clientId: uuid.optional().or(z.literal("")).default("") }),
  DEADLINE: z.object({ caseId: uuid, title: clip(200).min(3), kind: clip(80).optional().default(""), startDate: ymd, days: z.coerce.number().int().min(1).max(3650), countType: z.enum(["BUSINESS", "CALENDAR"]), notes: clip(2000).optional().default("") }),
  NOTE: z.object({ caseId: uuid, title: clip(120).optional().default(""), body: clip(8000).min(3) }),
  MINUTA: z.object({ caseId: uuid, title: clip(100).min(3), text: clip(30_000).min(50) }),
  ANDAMENTO: z.object({ caseId: uuid, text: clip(4000).min(3) }),
  PETICAO: z.object({ caseId: uuid, title: clip(100).min(3), text: clip(30_000).min(50), kind: clip(80).optional().default("") }),
  PROTOCOLO_PREPARO: z.object({ petitionId: uuid }),
} satisfies Record<ProposalKind, z.ZodType>;

export const TTL_DAYS = 14;
const MAX_PENDING = 30;

export type ProposalOrigin = { via: "MCP" | "ASSISTANT" | "API"; connection?: string | null };

function parsePayload(kind: ProposalKind, raw: unknown): Record<string, unknown> {
  const r = PROPOSAL_SCHEMAS[kind].safeParse(raw);
  if (!r.success) {
    const fields: Record<string, string[]> = {};
    for (const i of r.error.issues) (fields[i.path.join(".") || "_"] ??= []).push(i.message);
    throw new ValidationError(`Proposta inválida: ${r.error.issues[0]?.path.join(".") || "dados"} — ${r.error.issues[0]?.message}`, fields);
  }
  const out = { ...(r.data as Record<string, unknown>) };
  for (const k of ["text", "body", "description"]) if (typeof out[k] === "string") out[k] = stripUnverifiedCitations(out[k] as string).text;
  return out;
}

/** Cria a proposta. `ctx` é a pessoa em nome de quem a IA age: precisa ter a permissão da ação e enxergar o processo. */
export async function createProposal(ctx: TenantContext, origin: ProposalOrigin, input: { kind: string; title?: string; payload: unknown }) {
  await assertRuteOn(ctx.organizationId, "proposals");
  if (!Object.hasOwn(KINDS, input.kind)) throw new ValidationError("Tipo de proposta inválido.");
  const kind = input.kind as ProposalKind;
  assertCan(ctx, KINDS[kind].permission);
  const payload = parsePayload(kind, input.payload);
  let caseId: string | null = typeof payload.caseId === "string" && payload.caseId ? payload.caseId : null;
  let clientId: string | null = typeof payload.clientId === "string" && payload.clientId ? payload.clientId : null;
  if (Object.hasOwn(OPERATION_KINDS, kind)) {
    const links = await prepareOperation(ctx, kind as OperationKind, payload);
    caseId = links.caseId ?? caseId; clientId = links.clientId ?? clientId;
  }
  if (kind === "PROTOCOLO_PREPARO") {
    const p = await db.petitionFiling.findFirst({ where: { id: payload.petitionId as string, organizationId: ctx.organizationId }, select: { caseId: true, title: true, status: true } });
    if (!p) throw new NotFoundError("Petição não encontrada.");
    if (p.status !== "DRAFT") throw new ConflictError("Só petição em rascunho pode ser enviada para revisão.");
    caseId = p.caseId;
    payload.petitionTitle = p.title;
  }
  if (caseId) await assertCaseVisible(ctx, caseId);
  if (clientId && !(await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } }))) throw new NotFoundError("Cliente não encontrado.");
  if (kind === "TASK" && payload.assigneeId && !(await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: payload.assigneeId as string, status: "ACTIVE" }, select: { id: true } }))) throw new ValidationError("Responsável inválido.");
  const pending = await db.aiProposal.count({ where: { organizationId: ctx.organizationId, userId: ctx.userId, status: "PENDING" } });
  if (pending >= MAX_PENDING) throw new ConflictError(`Há ${MAX_PENDING} propostas aguardando confirmação. Confirme ou recuse algumas antes de pedir novas.`);
  const title = (input.title?.trim() || (payload.title as string) || KINDS[kind].label).slice(0, 200);
  const row = await db.aiProposal.create({
    data: { organizationId: ctx.organizationId, userId: ctx.userId, via: origin.via, connection: origin.connection ?? null, kind, title, payload: payload as never, caseId, clientId, expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000) },
    select: { id: true },
  });
  await audit({ action: "rute.proposal_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "ai_proposal", resourceId: row.id, metadata: { kind, via: origin.via }, meta: ctx.meta });
  return { id: row.id, kind, status: "PENDING" as const, message: "Proposta registrada em RUTE → Propostas. Uma pessoa precisa confirmar antes de qualquer coisa ser criada." };
}

async function expireOld(orgId: string) {
  await db.aiProposal.updateMany({ where: { organizationId: orgId, status: "PENDING", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED", decidedAt: new Date() } });
}

export type ProposalView = { id: string; kind: ProposalKind; kindLabel: string; risk: "LOW" | "HIGH"; title: string; payload: Record<string, unknown>; via: string; connection: string | null; caseId: string | null; caseTitle: string | null; status: string; proposerId: string; proposerName: string; createdAt: Date; expiresAt: Date; decisionNote: string | null; resultId: string | null; resultType: string | null };

async function toViews(ctx: TenantContext, rows: Awaited<ReturnType<typeof db.aiProposal.findMany>>): Promise<ProposalView[]> {
  const caseIds = [...new Set(rows.map((r) => r.caseId).filter((x): x is string => !!x))];
  const cases = caseIds.length ? await db.case.findMany({ where: { AND: [{ id: { in: caseIds }, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true, title: true } }) : [];
  const vis = new Map(cases.map((c) => [c.id, c.title]));
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows
    .filter((r) => !r.caseId || vis.has(r.caseId))
    .map((r) => ({ id: r.id, kind: r.kind as ProposalKind, kindLabel: KINDS[r.kind as ProposalKind]?.label ?? r.kind, risk: KINDS[r.kind as ProposalKind]?.risk ?? "HIGH", title: r.title, payload: r.payload as Record<string, unknown>, via: r.via, connection: r.connection, caseId: r.caseId, caseTitle: r.caseId ? (vis.get(r.caseId) ?? null) : null, status: r.status, proposerId: r.userId, proposerName: names.get(r.userId) ?? "—", createdAt: r.createdAt, expiresAt: r.expiresAt, decisionNote: r.decisionNote, resultId: r.resultId, resultType: r.resultType }));
}

/** Quem vê a proposta: quem a originou e quem tem permissão para executar aquela ação (e enxerga o processo). */
export async function listProposals(ctx: TenantContext, f: { status?: "PENDING" | "DECIDED" } = {}) {
  assertCan(ctx, "ai:use");
  await expireOld(ctx.organizationId);
  const rows = await db.aiProposal.findMany({
    where: { organizationId: ctx.organizationId, ...(f.status === "PENDING" ? { status: "PENDING" } : f.status === "DECIDED" ? { status: { not: "PENDING" } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const mineOrAble = rows.filter((r) => r.userId === ctx.userId || (KINDS[r.kind as ProposalKind] && can(ctx, KINDS[r.kind as ProposalKind].permission)));
  return toViews(ctx, mineOrAble);
}

export async function getProposal(ctx: TenantContext, id: string): Promise<ProposalView> {
  assertCan(ctx, "ai:use");
  await expireOld(ctx.organizationId);
  const row = await db.aiProposal.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!row || !Object.hasOwn(KINDS, row.kind) || (row.userId !== ctx.userId && (!KINDS[row.kind as ProposalKind] || !can(ctx, KINDS[row.kind as ProposalKind].permission)))) throw new NotFoundError("Proposta não encontrada.");
  const [v] = await toViews(ctx, [row]);
  if (!v) throw new NotFoundError("Proposta não encontrada.");
  return v;
}

export async function updateProposal(ctx: TenantContext, id: string, payload: unknown) {
  const p = await getProposal(ctx, id);
  if (p.status !== "PENDING") throw new ConflictError("Esta proposta já foi decidida.");
  assertCan(ctx, KINDS[p.kind].permission);
  const changes = payload as Record<string, unknown>;
  for (const key of ["caseId", "clientId", "taskId", "eventId", "packageId", "petitionId", "expectedUpdatedAt", "targetTitle", "collaboratorName", "workflowPreview"]) {
    if (Object.hasOwn(changes, key) && changes[key] !== p.payload[key]) throw new ValidationError("O registro de destino e a versão da proposta não podem ser alterados. Crie uma nova proposta.");
  }
  const clean = parsePayload(p.kind, { ...p.payload, ...changes });
  await db.aiProposal.update({ where: { id }, data: { payload: clean as never, title: (typeof clean.title === "string" && clean.title ? clean.title : p.title).slice(0, 200) } });
  await audit({ action: "rute.proposal_edit", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "ai_proposal", resourceId: id, meta: ctx.meta });
}

async function execute(ctx: TenantContext, kind: ProposalKind, p: Record<string, unknown>, id: string): Promise<{ type: string; id: string }> {
  if (Object.hasOwn(OPERATION_KINDS, kind)) return executeOperation(ctx, kind as OperationKind, p);
  const tag = `\n\n(Proposta da RUTE confirmada por uma pessoa.)`;
  switch (kind) {
    case "TASK": {
      const t = await createTask(ctx, { title: p.title as string, description: `${(p.description as string) ?? ""}${tag}`.trim(), status: "TODO", priority: p.priority as "NORMAL", dueDate: (p.dueDate as string) ?? "", assigneeId: (p.assigneeId as string) ?? "", caseId: (p.caseId as string) ?? "", clientId: (p.clientId as string) ?? "" });
      return { type: "task", id: t.id };
    }
    case "DEADLINE": {
      const calc = calculateDeadline({ startDate: p.startDate as string, days: p.days as number, countType: p.countType as "BUSINESS" });
      const d = await createDeadline(ctx, { caseId: p.caseId as string, title: p.title as string, kind: (p.kind as string) ?? "", startDate: p.startDate as string, days: String(p.days), countType: p.countType as "BUSINESS", dueDate: calc.dueDate, internalDueDate: "", responsibleId: "", notes: `${(p.notes as string) ?? ""}${tag}`.trim().slice(0, 2000), calculationNote: `Calculado pela proposta da RUTE (auxiliar). Conferir. ${calc.note}`.slice(0, 2000) });
      return { type: "deadline", id: d.id };
    }
    case "NOTE": {
      const n = await addCaseNoteItem(ctx, p.caseId as string, { title: (p.title as string) || "Anotação sugerida pela RUTE", body: p.body as string, pinned: false });
      return { type: "case_note", id: n.id };
    }
    case "ANDAMENTO": {
      const n = await addCaseNoteItem(ctx, p.caseId as string, { title: "Andamento (RUTE, confirmado por pessoa)", body: p.text as string, pinned: false });
      return { type: "case_note", id: n.id };
    }
    case "MINUTA": {
      const d = await saveDraftAsDocument(ctx, p.caseId as string, { title: p.title as string, text: p.text as string });
      return { type: "document", id: d.id };
    }
    case "PETICAO": {
      const d = await saveDraftAsDocument(ctx, p.caseId as string, { title: p.title as string, text: p.text as string });
      const pet = await createPetition(ctx, { caseId: p.caseId as string, documentId: d.id, title: p.title as string, kind: (p.kind as string) || null });
      return { type: "petition", id: pet.id };
    }
    case "PROTOCOLO_PREPARO": {
      await requestReview(ctx, p.petitionId as string);
      return { type: "petition", id: p.petitionId as string };
    }
  }
  void id;
  throw new ValidationError("Tipo de proposta não implementado.");
}

/** Aprovação humana. Itens de risco alto exigem `confirmHighRisk`. O resultado nasce com a permissão de QUEM APROVA. */
export async function approveProposal(ctx: TenantContext, id: string, opts: { confirmHighRisk?: boolean; edited?: unknown } = {}) {
  await assertRuteOn(ctx.organizationId, "proposals", { allowDuringStop: true });
  const p = await getProposal(ctx, id);
  if (p.status !== "PENDING") throw new ConflictError("Esta proposta já foi decidida.");
  assertCan(ctx, KINDS[p.kind].permission);
  if (KINDS[p.kind].risk === "HIGH" && opts.confirmHighRisk !== true) throw new ValidationError("Esta é uma ação de maior risco: confirme expressamente que revisou o conteúdo.", { confirm: ["Confirme que revisou."] });
  if (opts.edited) await updateProposal(ctx, id, opts.edited);
  const fresh = await getProposal(ctx, id);
  const claimed = await db.aiProposal.updateMany({ where: { id, organizationId: ctx.organizationId, status: "PENDING" }, data: { status: "APPROVED", decidedById: ctx.userId, decidedAt: new Date() } });
  if (claimed.count === 0) throw new ConflictError("Esta proposta já foi decidida.");
  try {
    const res = await execute(ctx, fresh.kind, fresh.payload, id);
    await db.aiProposal.update({ where: { id }, data: { resultType: res.type, resultId: res.id } });
    await audit({ action: "rute.proposal_approve", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "ai_proposal", resourceId: id, metadata: { kind: fresh.kind, via: fresh.via, proposerId: fresh.proposerId, resultType: res.type, resultId: res.id }, meta: ctx.meta });
    return res;
  } catch (e) {
    await db.aiProposal.update({ where: { id }, data: { status: "PENDING", decidedById: null, decidedAt: null } });
    throw e;
  }
}

export async function rejectProposal(ctx: TenantContext, id: string, note?: string) {
  const p = await getProposal(ctx, id);
  if (p.status !== "PENDING") throw new ConflictError("Esta proposta já foi decidida.");
  if (p.proposerId !== ctx.userId && !can(ctx, KINDS[p.kind].permission)) throw new ForbiddenError();
  const r = await db.aiProposal.updateMany({ where: { id, organizationId: ctx.organizationId, status: "PENDING" }, data: { status: "REJECTED", decidedById: ctx.userId, decidedAt: new Date(), decisionNote: note?.trim().slice(0, 500) || null } });
  if (r.count === 0) throw new ConflictError("Esta proposta já foi decidida.");
  await audit({ action: "rute.proposal_reject", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "ai_proposal", resourceId: id, metadata: { kind: p.kind }, meta: ctx.meta });
}

export async function pendingProposalCount(ctx: TenantContext): Promise<number> {
  return (await listProposals(ctx, { status: "PENDING" })).length;
}
