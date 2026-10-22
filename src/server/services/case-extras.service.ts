import { db } from "@/lib/db/client";
import { todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { fromCents, toCents } from "@/lib/finance/money";
import type { IndexSeries } from "@/lib/finance/correction";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { parseMoneyBR } from "@/lib/validation/money";
import { appealSchema, feeSchema, linkSchema, valuationSchema, APPEAL_STATUS_LABEL, DEGREE_LABEL, FEE_KIND_LABEL, LINK_KIND_LABEL } from "@/modules/cases/case-extras-schemas";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible, caseVisibility, logCaseEvent } from "./case.service";
import { isUniqueViolation } from "./db-errors";
import { correctValue } from "./monetary-index.service";
import { entryTotalsFor } from "./finance.service";

const nz = (v: string) => (v.trim() === "" ? null : v.trim());
const money2 = (d: { toString(): string } | null) => (d === null ? null : fromCents(toCents(d.toString()) ?? 0n));
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// ======================= honorários do processo =======================

export async function listCaseFees(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "finance:read");
  await assertCaseVisible(ctx, caseId);
  const rows = await db.caseFee.findMany({ where: { caseId, organizationId: ctx.organizationId, deletedAt: null }, orderBy: { createdAt: "asc" } });
  const fixed = rows.reduce((a, r) => a + (r.amount ? (toCents(r.amount.toString()) ?? 0n) : 0n), 0n);
  const totals = await entryTotalsFor(ctx, { caseId });
  return {
    fees: rows.map((r) => ({ id: r.id, kind: r.kind, description: r.description, amount: money2(r.amount), percent: r.percent ? r.percent.toString() : null, notes: r.notes })),
    contractedFixed: fromCents(fixed),
    finance: totals,
  };
}

export async function addCaseFee(ctx: TenantContext, caseId: string, raw: unknown) {
  assertCan(ctx, "cases:write");
  assertCan(ctx, "finance:write");
  const v = feeSchema.parse(raw);
  await assertCaseVisible(ctx, caseId);
  const amount = v.amount ? parseMoneyBR(v.amount) : null;
  if (v.amount && (amount === null || toCents(amount) === 0n)) throw new ValidationError("O valor deve ser maior que zero.", { amount: ["O valor deve ser maior que zero."] });
  const percent = v.percent ? v.percent.replace(",", ".") : null;
  return db.$transaction(async (tx) => {
    const r = await tx.caseFee.create({ data: { organizationId: ctx.organizationId, caseId, kind: v.kind, description: v.description, amount, percent, notes: nz(v.notes), createdById: ctx.userId }, select: { id: true } });
    await logCaseEvent(tx, ctx, caseId, { kind: "FEE_ADDED", title: `Honorário registrado: ${FEE_KIND_LABEL[v.kind]} — ${v.description}` });
    await audit({ action: "case.fee_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, meta: ctx.meta }, tx);
    return r;
  });
}

export async function removeCaseFee(ctx: TenantContext, caseId: string, feeId: string) {
  assertCan(ctx, "cases:write");
  assertCan(ctx, "finance:write");
  await assertCaseVisible(ctx, caseId);
  await db.$transaction(async (tx) => {
    const res = await tx.caseFee.updateMany({ where: { id: feeId, caseId, organizationId: ctx.organizationId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (res.count === 0) throw new NotFoundError("Honorário não encontrado.");
    await logCaseEvent(tx, ctx, caseId, { kind: "FEE_REMOVED", title: "Honorário removido do processo" });
  });
}

// ======================= apensos / processos relacionados =======================

export async function linkCases(ctx: TenantContext, caseId: string, raw: unknown) {
  assertCan(ctx, "cases:write");
  const v = linkSchema.parse(raw);
  if (v.relatedCaseId === caseId) throw new ValidationError("Um processo não pode ser vinculado a ele mesmo.", { relatedCaseId: ["Um processo não pode ser vinculado a ele mesmo."] });
  const [a, b] = await Promise.all([assertCaseVisible(ctx, caseId), assertCaseVisible(ctx, v.relatedCaseId)]);
  try {
    await db.$transaction(async (tx) => {
      await tx.caseLink.create({ data: { organizationId: ctx.organizationId, caseId, relatedCaseId: v.relatedCaseId, kind: v.kind, notes: nz(v.notes), createdById: ctx.userId } });
      await logCaseEvent(tx, ctx, caseId, { kind: "LINK_ADDED", title: `${LINK_KIND_LABEL[v.kind]}: ${b.title}` });
      await logCaseEvent(tx, ctx, v.relatedCaseId, { kind: "LINK_ADDED", title: `Vinculado a: ${a.title}` });
      await audit({ action: "case.link_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { related: v.relatedCaseId }, meta: ctx.meta }, tx);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("Estes processos já estão vinculados.");
    throw e;
  }
}

export async function unlinkCases(ctx: TenantContext, caseId: string, linkId: string) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const res = await db.caseLink.deleteMany({ where: { id: linkId, organizationId: ctx.organizationId, OR: [{ caseId }, { relatedCaseId: caseId }] } });
  if (res.count === 0) throw new NotFoundError("Vínculo não encontrado.");
  await audit({ action: "case.link_remove", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, meta: ctx.meta });
}

/** Processos vinculados, nos dois sentidos. Os sigilosos que o usuário não pode ver nem aparecem. */
export async function listCaseLinks(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const links = await db.caseLink.findMany({ where: { organizationId: ctx.organizationId, OR: [{ caseId }, { relatedCaseId: caseId }] }, orderBy: { createdAt: "asc" } });
  const otherIds = links.map((l) => (l.caseId === caseId ? l.relatedCaseId : l.caseId));
  const cases = otherIds.length ? await db.case.findMany({ where: { AND: [{ id: { in: otherIds }, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true, number: true, title: true, status: true } }) : [];
  const map = new Map(cases.map((c) => [c.id, c]));
  return links.flatMap((l) => {
    const otherId = l.caseId === caseId ? l.relatedCaseId : l.caseId;
    const c = map.get(otherId);
    if (!c) return [];
    const parent = l.caseId === caseId; // este é o principal; o outro é o apenso/dependente
    return [{ id: l.id, kind: l.kind, role: l.kind === "CONEXO" ? "Relacionado" : parent ? (l.kind === "APENSO" ? "Apenso" : "Dependente") : "Principal", notes: l.notes, other: c }];
  });
}

// ======================= recursos por grau =======================

export async function listAppeals(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const rows = await db.caseAppeal.findMany({ where: { caseId, organizationId: ctx.organizationId, deletedAt: null }, orderBy: [{ filedOn: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({ id: r.id, degree: r.degree, appealType: r.appealType, number: r.number, court: r.court, filedOn: day(r.filedOn), status: r.status, judgedOn: day(r.judgedOn), notes: r.notes }));
}

export async function saveAppeal(ctx: TenantContext, caseId: string, raw: unknown, appealId?: string) {
  assertCan(ctx, "cases:write");
  const v = appealSchema.parse(raw);
  await assertCaseVisible(ctx, caseId);
  const data = { degree: v.degree, appealType: v.appealType, number: nz(v.number), court: nz(v.court), filedOn: v.filedOn ? ymdToDate(v.filedOn) : null, status: v.status, judgedOn: v.judgedOn ? ymdToDate(v.judgedOn) : null, notes: nz(v.notes) };
  if (v.status === "PENDENTE" && v.judgedOn) throw new ValidationError("Recurso pendente não tem data de julgamento.", { judgedOn: ["Recurso pendente não tem data de julgamento."] });
  return db.$transaction(async (tx) => {
    let id = appealId;
    if (appealId) {
      const res = await tx.caseAppeal.updateMany({ where: { id: appealId, caseId, organizationId: ctx.organizationId, deletedAt: null }, data });
      if (res.count === 0) throw new NotFoundError("Recurso não encontrado.");
    } else {
      id = (await tx.caseAppeal.create({ data: { ...data, organizationId: ctx.organizationId, caseId, createdById: ctx.userId }, select: { id: true } })).id;
    }
    await logCaseEvent(tx, ctx, caseId, { kind: appealId ? "APPEAL_UPDATED" : "APPEAL_ADDED", title: `${v.appealType} (${DEGREE_LABEL[v.degree]}) — ${APPEAL_STATUS_LABEL[v.status]}` });
    return { id: id! };
  });
}

export async function removeAppeal(ctx: TenantContext, caseId: string, appealId: string) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const res = await db.caseAppeal.updateMany({ where: { id: appealId, caseId, organizationId: ctx.organizationId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (res.count === 0) throw new NotFoundError("Recurso não encontrado.");
}

// ======================= valor da causa e provisão corrigidos =======================

export async function setValuation(ctx: TenantContext, caseId: string, raw: unknown) {
  assertCan(ctx, "cases:write");
  const v = valuationSchema.parse(raw);
  await assertCaseVisible(ctx, caseId);
  await db.$transaction(async (tx) => {
    await tx.case.update({
      where: { id: caseId },
      data: { claimBaseDate: v.claimBaseDate ? ymdToDate(v.claimBaseDate) : null, provisionValue: v.provisionValue ? parseMoneyBR(v.provisionValue) : null, provisionBaseDate: v.provisionBaseDate ? ymdToDate(v.provisionBaseDate) : null, correctionIndex: v.correctionIndex || null },
    });
    await logCaseEvent(tx, ctx, caseId, { kind: "VALUATION_UPDATED", title: "Provisão e correção do valor atualizadas" });
    await audit({ action: "case.valuation_set", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, meta: ctx.meta }, tx);
  });
}

export type ValuePart = { original: string; baseDate: string; result: { ok: true; corrected: string; factor: string; months: number } | { ok: false; missing: string[] } | { ok: false; reason: string } };

/** Valor da causa e provisão, originais e corrigidos até hoje pelo índice escolhido. Sem índice completo, não calcula. */
export async function getValuation(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { claimValue: true, claimBaseDate: true, distributedAt: true, provisionValue: true, provisionBaseDate: true, correctionIndex: true } });
  const series = c.correctionIndex as IndexSeries | null;
  const part = async (value: string | null, base: string | null): Promise<ValuePart | null> => {
    if (!value || !base) return null;
    if (!series) return { original: value, baseDate: base, result: { ok: false, reason: "Escolha o índice de correção." } };
    const r = await correctValue(ctx, { value, series, baseDate: base });
    return { original: value, baseDate: base, result: r.ok ? { ok: true, corrected: r.corrected, factor: r.factor, months: r.months } : { ok: false, missing: r.missing } };
  };
  const claimBase = day(c.claimBaseDate) ?? day(c.distributedAt);
  return {
    index: series,
    today: todayYmd(ctx.timezone),
    claimBaseDate: day(c.claimBaseDate),
    provisionBaseDate: day(c.provisionBaseDate),
    claim: await part(money2(c.claimValue), claimBase),
    provision: await part(money2(c.provisionValue), day(c.provisionBaseDate)),
  };
}

// ======================= histórico consolidado =======================

export type HistoryItem = { at: string; source: string; title: string; detail?: string; href?: string };

/**
 * Tudo que aconteceu no processo, numa linha só: andamentos e registros, tarefas, prazos, intimações, petições, recursos,
 * anotações, documentos e lançamentos financeiros. Cada fonte só entra se o usuário tem permissão para vê-la.
 */
export async function consolidatedHistory(ctx: TenantContext, caseId: string, limit = 200): Promise<HistoryItem[]> {
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const org = ctx.organizationId;
  const take = Math.min(Math.max(limit, 1), 500);
  const items: HistoryItem[] = [];
  const iso = (d: Date) => d.toISOString();
  const jobs: Promise<void>[] = [];
  jobs.push(
    db.caseEvent.findMany({ where: { caseId, organizationId: org }, orderBy: { occurredAt: "desc" }, take }).then((rows) => {
      for (const r of rows) items.push({ at: iso(r.occurredAt), source: r.source === "IMPORTED" ? "Andamento" : "Registro", title: r.title, detail: r.description ?? undefined });
    }),
    db.caseNote.findMany({ where: { caseId, organizationId: org }, orderBy: { createdAt: "desc" }, take }).then((rows) => {
      for (const r of rows) items.push({ at: iso(r.createdAt), source: "Anotação", title: r.title ?? "Anotação", detail: r.body.slice(0, 200) });
    }),
    db.caseAppeal.findMany({ where: { caseId, organizationId: org, deletedAt: null }, take }).then((rows) => {
      for (const r of rows) items.push({ at: iso(r.filedOn ?? r.createdAt), source: "Recurso", title: `${r.appealType} (${DEGREE_LABEL[r.degree as keyof typeof DEGREE_LABEL] ?? r.degree})`, detail: APPEAL_STATUS_LABEL[r.status as keyof typeof APPEAL_STATUS_LABEL] ?? r.status });
    }),
  );
  if (can(ctx, "tasks:read"))
    jobs.push(db.task.findMany({ where: { caseId, organizationId: org, deletedAt: null }, orderBy: { createdAt: "desc" }, take }).then((rows) => {
      for (const r of rows) {
        items.push({ at: iso(r.createdAt), source: "Tarefa", title: r.title, href: `/tarefas/${r.id}` });
        if (r.completedAt) items.push({ at: iso(r.completedAt), source: "Tarefa", title: `Concluída: ${r.title}`, href: `/tarefas/${r.id}` });
      }
    }));
  if (can(ctx, "deadlines:read"))
    jobs.push(db.deadline.findMany({ where: { caseId, organizationId: org }, orderBy: { createdAt: "desc" }, take }).then((rows) => {
      for (const r of rows) items.push({ at: iso(r.createdAt), source: "Prazo", title: `${r.title} — vence ${r.dueDate.toISOString().slice(0, 10)}`, href: `/prazos/${r.id}` });
    }));
  if (can(ctx, "inbox:read"))
    jobs.push(db.courtNotice.findMany({ where: { caseId, organizationId: org, deletedAt: null }, orderBy: { receivedAt: "desc" }, take }).then((rows) => {
      for (const r of rows) items.push({ at: iso(r.publishedAt ?? r.receivedAt), source: "Intimação", title: r.title });
    }));
  if (can(ctx, "petitions:read"))
    jobs.push(db.petitionFiling.findMany({ where: { caseId, organizationId: org, deletedAt: null }, orderBy: { createdAt: "desc" }, take }).then((rows) => {
      for (const r of rows) items.push({ at: iso(r.createdAt), source: "Petição", title: r.title, href: `/peticoes/${r.id}` });
    }));
  if (can(ctx, "documents:read"))
    jobs.push(db.document.findMany({ where: { caseId, organizationId: org, deletedAt: null }, orderBy: { createdAt: "desc" }, take }).then((rows) => {
      for (const r of rows) items.push({ at: iso(r.createdAt), source: "Documento", title: r.name });
    }));
  if (can(ctx, "finance:read"))
    jobs.push(db.financeEntry.findMany({ where: { caseId, organizationId: org, status: { not: "CANCELED" } }, orderBy: { createdAt: "desc" }, take }).then((rows) => {
      for (const r of rows) items.push({ at: iso(r.createdAt), source: "Financeiro", title: `${r.kind === "RECEIVABLE" ? "A receber" : "A pagar"}: ${r.description}`, href: `/financeiro/lancamentos/${r.id}` });
    }));
  await Promise.all(jobs);
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, take);
}
