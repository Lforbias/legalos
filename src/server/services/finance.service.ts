import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { addMonthsClamped, fromCents, splitInstallments, toCents } from "@/lib/finance/money";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { parseMoneyBR } from "@/lib/validation/money";
import { accountSchema, categorySchema, costCenterSchema, entrySchema, paymentSchema, reasonSchema, type EntryInput } from "@/modules/finance/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { caseVisibility } from "./case.service";
import { isUniqueViolation } from "./db-errors";
import { userNames } from "./members";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nullIfEmpty = (v: string) => (v.trim() === "" ? null : v.trim());
const money = (v: string): string => {
  const m = parseMoneyBR(v);
  if (m === null) throw new ValidationError("Valor inválido.", { amount: ["Valor inválido. Exemplo: 1.234,56"] });
  return m;
};

// ======================= cadastros (contas, categorias, centros de custo) =======================

export async function listAccounts(ctx: TenantContext, opts: { includeInactive?: boolean } = {}) {
  assertCan(ctx, "finance:read");
  return db.financeAccount.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: { name: "asc" },
  });
}

export async function createAccount(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "finance:manage");
  const v = accountSchema.parse(raw);
  try {
    const a = await db.financeAccount.create({
      data: { organizationId: ctx.organizationId, name: v.name, kind: v.kind, initialBalance: v.initialBalance ? money(v.initialBalance) : "0.00", openingDate: v.openingDate ? ymdToDate(v.openingDate) : null },
    });
    await audit({ action: "finance.account_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_account", resourceId: a.id, meta: ctx.meta });
    return a;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe uma conta com este nome.");
    throw err;
  }
}

export async function setAccountActive(ctx: TenantContext, id: string, active: boolean) {
  assertCan(ctx, "finance:manage");
  const res = await db.financeAccount.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { active } });
  if (res.count === 0) throw new NotFoundError("Conta não encontrada.");
  await audit({ action: active ? "finance.account_enable" : "finance.account_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_account", resourceId: id, meta: ctx.meta });
}

export async function listCategories(ctx: TenantContext, opts: { includeInactive?: boolean } = {}) {
  assertCan(ctx, "finance:read");
  return db.financeCategory.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, ...(opts.includeInactive ? {} : { active: true }) }, orderBy: { name: "asc" } });
}

export async function createCategory(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "finance:manage");
  const v = categorySchema.parse(raw);
  try {
    const c = await db.financeCategory.create({ data: { organizationId: ctx.organizationId, name: v.name, color: nullIfEmpty(v.color) } });
    await audit({ action: "finance.category_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_category", resourceId: c.id, meta: ctx.meta });
    return c;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe uma categoria com este nome.");
    throw err;
  }
}

export async function setCategoryActive(ctx: TenantContext, id: string, active: boolean) {
  assertCan(ctx, "finance:manage");
  const res = await db.financeCategory.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { active } });
  if (res.count === 0) throw new NotFoundError("Categoria não encontrada.");
  await audit({ action: active ? "finance.category_enable" : "finance.category_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_category", resourceId: id, meta: ctx.meta });
}

export async function listCostCenters(ctx: TenantContext, opts: { includeInactive?: boolean } = {}) {
  assertCan(ctx, "finance:read");
  return db.costCenter.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, ...(opts.includeInactive ? {} : { active: true }) }, orderBy: { name: "asc" } });
}

export async function createCostCenter(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "finance:manage");
  const v = costCenterSchema.parse(raw);
  try {
    const c = await db.costCenter.create({ data: { organizationId: ctx.organizationId, name: v.name } });
    await audit({ action: "finance.cost_center_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cost_center", resourceId: c.id, meta: ctx.meta });
    return c;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Já existe um centro de custo com este nome.");
    throw err;
  }
}

export async function setCostCenterActive(ctx: TenantContext, id: string, active: boolean) {
  assertCan(ctx, "finance:manage");
  const res = await db.costCenter.updateMany({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, data: { active } });
  if (res.count === 0) throw new NotFoundError("Centro de custo não encontrado.");
  await audit({ action: active ? "finance.cost_center_enable" : "finance.cost_center_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "cost_center", resourceId: id, meta: ctx.meta });
}

// ======================= lançamentos =======================

/** Valida, DENTRO do escritório, todas as referências informadas. Processo sigiloso sem acesso = "não encontrado". */
async function resolveRefs(ctx: TenantContext, v: Pick<EntryInput, "accountId" | "categoryId" | "costCenterId" | "clientId" | "caseId">, tx: Tx | typeof db = db) {
  const org = ctx.organizationId;
  const checks: [string, Promise<unknown>, string][] = [];
  if (v.accountId) checks.push(["accountId", tx.financeAccount.findFirst({ where: { id: v.accountId, organizationId: org, deletedAt: null, active: true }, select: { id: true } }), "Conta não encontrada ou inativa."]);
  if (v.categoryId) checks.push(["categoryId", tx.financeCategory.findFirst({ where: { id: v.categoryId, organizationId: org, deletedAt: null, active: true }, select: { id: true } }), "Categoria não encontrada ou inativa."]);
  if (v.costCenterId) checks.push(["costCenterId", tx.costCenter.findFirst({ where: { id: v.costCenterId, organizationId: org, deletedAt: null, active: true }, select: { id: true } }), "Centro de custo não encontrado ou inativo."]);
  if (v.clientId) checks.push(["clientId", tx.client.findFirst({ where: { id: v.clientId, organizationId: org, deletedAt: null }, select: { id: true } }), "Cliente não encontrado."]);
  if (v.caseId) checks.push(["caseId", tx.case.findFirst({ where: { AND: [{ id: v.caseId, organizationId: org, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true } }), "Processo não encontrado."]);
  const found = await Promise.all(checks.map((c) => c[1]));
  found.forEach((f, i) => {
    if (!f) throw new ValidationError(checks[i]![2], { [checks[i]![0]]: [checks[i]![2]] });
  });
}

function entryData(v: Omit<EntryInput, "installments">) {
  return {
    kind: v.kind,
    type: v.type,
    description: v.description,
    issueDate: ymdToDate(v.issueDate),
    accountId: nullIfEmpty(v.accountId),
    categoryId: nullIfEmpty(v.categoryId),
    costCenterId: nullIfEmpty(v.costCenterId),
    clientId: nullIfEmpty(v.clientId),
    caseId: nullIfEmpty(v.caseId),
    counterparty: nullIfEmpty(v.counterparty),
    notes: nullIfEmpty(v.notes),
  };
}

/** Cria 1 lançamento ou N parcelas mensais (o valor informado é o TOTAL; centavos restantes vão para as primeiras parcelas). */
export async function createEntry(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "finance:write");
  const v = entrySchema.parse(raw);
  const total = toCents(money(v.amount))!;
  const n = Number(v.installments);
  if (total === 0n) throw new ValidationError("O valor deve ser maior que zero.", { amount: ["O valor deve ser maior que zero."] });
  if (total < BigInt(n)) throw new ValidationError("Valor pequeno demais para este número de parcelas.", { installments: ["Valor pequeno demais para este número de parcelas."] });
  await resolveRefs(ctx, v);
  const parts = splitInstallments(total, n);
  const groupId = n > 1 ? randomUUID() : null;
  const ids = await db.$transaction(async (tx) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const e = await tx.financeEntry.create({
        data: {
          ...entryData(v),
          organizationId: ctx.organizationId,
          amount: fromCents(parts[i]!),
          dueDate: ymdToDate(addMonthsClamped(v.dueDate, i)),
          groupId,
          installmentNo: n > 1 ? i + 1 : null,
          installmentTotal: n > 1 ? n : null,
          createdById: ctx.userId,
        },
        select: { id: true },
      });
      out.push(e.id);
    }
    await audit({ action: "finance.entry_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_entry", resourceId: out[0], metadata: { kind: v.kind, installments: n, total: fromCents(total) }, meta: ctx.meta }, tx);
    return out;
  });
  return { id: ids[0]!, ids };
}

/** Edita um lançamento. O valor não pode ficar abaixo do que já foi baixado; cancelado não se edita. */
export async function updateEntry(ctx: TenantContext, id: string, raw: unknown) {
  assertCan(ctx, "finance:write");
  const v = entrySchema.omit({ installments: true }).parse(raw);
  const amount = money(v.amount);
  if (toCents(amount) === 0n) throw new ValidationError("O valor deve ser maior que zero.", { amount: ["O valor deve ser maior que zero."] });
  await resolveRefs(ctx, v);
  await db.$transaction(async (tx) => {
    const cur = await tx.financeEntry.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, status: true, kind: true } });
    if (!cur) throw new NotFoundError("Lançamento não encontrado.");
    if (cur.status === "CANCELED") throw new ConflictError("Lançamento cancelado não pode ser editado.");
    const { kind: _kind, ...rest } = entryData(v);
    void _kind;
    const res = await tx.financeEntry.updateMany({ where: { id, organizationId: ctx.organizationId, status: { not: "CANCELED" } }, data: { ...rest, type: v.type, dueDate: ymdToDate(v.dueDate) } });
    if (res.count === 0) throw new ConflictError("O lançamento mudou. Recarregue a página.");
    // valor + situação de forma atômica: nunca abaixo do já baixado
    const n = await tx.$executeRaw`UPDATE finance_entries
      SET amount = ${amount}::numeric,
          status = CASE WHEN paid_amount = ${amount}::numeric THEN 'PAID'::"FinanceEntryStatus" WHEN paid_amount > 0 THEN 'PARTIAL'::"FinanceEntryStatus" ELSE 'OPEN'::"FinanceEntryStatus" END,
          updated_at = now()
      WHERE id = ${id}::uuid AND organization_id = ${ctx.organizationId}::uuid AND status <> 'CANCELED' AND paid_amount <= ${amount}::numeric`;
    if (n === 0) throw new ValidationError("O valor não pode ser menor que o já pago.", { amount: ["O valor não pode ser menor que o já pago. Estorne uma baixa antes, se necessário."] });
    await audit({ action: "finance.entry_update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_entry", resourceId: id, meta: ctx.meta }, tx);
  });
}

/** Cancela um lançamento SEM baixas (com baixas, estorne-as primeiro). Exige `finance:manage` e motivo. */
export async function cancelEntry(ctx: TenantContext, id: string, rawReason: unknown) {
  assertCan(ctx, "finance:manage");
  const { reason } = reasonSchema.parse({ reason: rawReason });
  await db.$transaction(async (tx) => {
    const res = await tx.financeEntry.updateMany({
      where: { id, organizationId: ctx.organizationId, status: "OPEN", paidAmount: 0 },
      data: { status: "CANCELED", canceledAt: new Date(), canceledReason: reason, canceledById: ctx.userId },
    });
    if (res.count === 0) {
      const cur = await tx.financeEntry.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { status: true } });
      if (!cur) throw new NotFoundError("Lançamento não encontrado.");
      throw new ConflictError(cur.status === "CANCELED" ? "O lançamento já está cancelado." : "Há baixas neste lançamento. Estorne-as antes de cancelar.");
    }
    await audit({ action: "finance.entry_cancel", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_entry", resourceId: id, metadata: { reason }, meta: ctx.meta }, tx);
  });
}

// ---------- baixas e estornos ----------

/**
 * Registra um pagamento (total ou parcial). Atômico: o UPDATE condicional impede baixar mais que o saldo, mesmo com
 * dois usuários ao mesmo tempo. A data não pode estar no futuro.
 */
export async function registerPayment(ctx: TenantContext, entryId: string, raw: unknown) {
  assertCan(ctx, "finance:write");
  const v = paymentSchema.parse(raw);
  const amount = money(v.amount);
  if (toCents(amount) === 0n) throw new ValidationError("O valor deve ser maior que zero.", { amount: ["O valor deve ser maior que zero."] });
  if (v.paidOn > todayYmd(ctx.timezone)) throw new ValidationError("A data do pagamento não pode ser futura.", { paidOn: ["A data do pagamento não pode ser futura."] });
  return db.$transaction(async (tx) => {
    const entry = await tx.financeEntry.findFirst({ where: { id: entryId, organizationId: ctx.organizationId }, select: { id: true, status: true } });
    if (!entry) throw new NotFoundError("Lançamento não encontrado.");
    if (entry.status === "CANCELED") throw new ConflictError("Lançamento cancelado não recebe baixa.");
    const account = await tx.financeAccount.findFirst({ where: { id: v.accountId, organizationId: ctx.organizationId, deletedAt: null, active: true }, select: { id: true } });
    if (!account) throw new ValidationError("Conta não encontrada ou inativa.", { accountId: ["Conta não encontrada ou inativa."] });
    const n = await tx.$executeRaw`UPDATE finance_entries
      SET paid_amount = paid_amount + ${amount}::numeric,
          status = CASE WHEN paid_amount + ${amount}::numeric >= amount THEN 'PAID'::"FinanceEntryStatus" ELSE 'PARTIAL'::"FinanceEntryStatus" END,
          updated_at = now()
      WHERE id = ${entryId}::uuid AND organization_id = ${ctx.organizationId}::uuid AND status IN ('OPEN', 'PARTIAL') AND paid_amount + ${amount}::numeric <= amount`;
    if (n === 0) throw new ConflictError("O valor é maior que o saldo em aberto (ou o lançamento mudou). Recarregue a página.");
    const p = await tx.financePayment.create({
      data: { organizationId: ctx.organizationId, entryId, accountId: v.accountId, amount, paidOn: ymdToDate(v.paidOn), method: nullIfEmpty(v.method), note: nullIfEmpty(v.note), createdById: ctx.userId },
    });
    await audit({ action: "finance.payment_register", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_payment", resourceId: p.id, metadata: { entryId, amount }, meta: ctx.meta }, tx);
    return { id: p.id };
  });
}

/** Estorna uma baixa (a baixa permanece no histórico, marcada como estornada, e o saldo do lançamento volta). Exige motivo. */
export async function reversePayment(ctx: TenantContext, paymentId: string, rawReason: unknown) {
  assertCan(ctx, "finance:manage");
  const { reason } = reasonSchema.parse({ reason: rawReason });
  await db.$transaction(async (tx) => {
    const p = await tx.financePayment.findFirst({ where: { id: paymentId, organizationId: ctx.organizationId }, select: { id: true, entryId: true, amount: true, reversedAt: true } });
    if (!p) throw new NotFoundError("Baixa não encontrada.");
    const claimed = await tx.financePayment.updateMany({ where: { id: paymentId, organizationId: ctx.organizationId, reversedAt: null }, data: { reversedAt: new Date(), reversedById: ctx.userId, reversalReason: reason } });
    if (claimed.count === 0) throw new ConflictError("Esta baixa já foi estornada.");
    const amount = p.amount.toString();
    const n = await tx.$executeRaw`UPDATE finance_entries
      SET paid_amount = paid_amount - ${amount}::numeric,
          status = CASE WHEN paid_amount - ${amount}::numeric = 0 THEN 'OPEN'::"FinanceEntryStatus" ELSE 'PARTIAL'::"FinanceEntryStatus" END,
          updated_at = now()
      WHERE id = ${p.entryId}::uuid AND organization_id = ${ctx.organizationId}::uuid AND status IN ('PAID', 'PARTIAL') AND paid_amount - ${amount}::numeric >= 0`;
    if (n === 0) throw new ConflictError("Não foi possível estornar: o lançamento mudou. Recarregue a página.");
    await audit({ action: "finance.payment_reverse", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_payment", resourceId: paymentId, metadata: { entryId: p.entryId, amount, reason }, meta: ctx.meta }, tx);
  });
}

// ---------- consultas ----------

export type EntryFilters = {
  kind?: string;
  status?: string; // aberto | vencido | pago | cancelado | todos
  q?: string;
  from?: string; // vencimento >=
  to?: string; // vencimento <=
  clientId?: string;
  caseId?: string;
  categoryId?: string;
  page?: number;
};
const PAGE_SIZE = 50;

function entryWhere(ctx: TenantContext, f: EntryFilters): Prisma.FinanceEntryWhereInput {
  const today = ymdToDate(todayYmd(ctx.timezone));
  const q = f.q?.trim().slice(0, 80);
  const and: Prisma.FinanceEntryWhereInput[] = [{ organizationId: ctx.organizationId }];
  if (f.kind === "RECEIVABLE" || f.kind === "PAYABLE") and.push({ kind: f.kind });
  if (f.status === "vencido") and.push({ status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: today } });
  else if (f.status === "pago") and.push({ status: "PAID" });
  else if (f.status === "cancelado") and.push({ status: "CANCELED" });
  else if (f.status === "todos") and.push({});
  else and.push({ status: { in: ["OPEN", "PARTIAL"] } });
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) and.push({ dueDate: { gte: ymdToDate(f.from) } });
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) and.push({ dueDate: { lte: ymdToDate(f.to) } });
  if (f.clientId && UUID.test(f.clientId)) and.push({ clientId: f.clientId });
  if (f.caseId && UUID.test(f.caseId)) and.push({ caseId: f.caseId });
  if (f.categoryId && UUID.test(f.categoryId)) and.push({ categoryId: f.categoryId });
  if (q) and.push({ OR: [{ description: { contains: q, mode: "insensitive" } }, { counterparty: { contains: q, mode: "insensitive" } }] });
  return { AND: and };
}

/** Títulos de processos, mas só para os que o usuário pode ver (sigilosos viram null). */
async function visibleCaseTitles(ctx: TenantContext, ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string | null>(unique.map((i) => [i, null]));
  if (!unique.length) return out;
  const rows = await db.case.findMany({ where: { AND: [{ id: { in: unique }, organizationId: ctx.organizationId }, caseVisibility(ctx)] }, select: { id: true, title: true } });
  for (const r of rows) out.set(r.id, r.title);
  return out;
}

export async function listEntries(ctx: TenantContext, f: EntryFilters = {}) {
  assertCan(ctx, "finance:read");
  const where = entryWhere(ctx, f);
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const [items, total, sums] = await Promise.all([
    db.financeEntry.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.financeEntry.count({ where }),
    db.financeEntry.aggregate({ where, _sum: { amount: true, paidAmount: true } }),
  ]);
  const clientIds = [...new Set(items.map((i) => i.clientId).filter((x): x is string => !!x))];
  const [clients, titles] = await Promise.all([
    clientIds.length ? db.client.findMany({ where: { id: { in: clientIds }, organizationId: ctx.organizationId }, select: { id: true, name: true } }) : Promise.resolve([]),
    visibleCaseTitles(ctx, items.map((i) => i.caseId)),
  ]);
  const cmap = new Map(clients.map((c) => [c.id, c.name]));
  const amountSum = toCents(sums._sum.amount?.toString() ?? "0") ?? 0n;
  const paidSum = toCents(sums._sum.paidAmount?.toString() ?? "0") ?? 0n;
  return {
    items: items.map((i) => ({ ...i, clientName: i.clientId ? (cmap.get(i.clientId) ?? null) : null, caseTitle: i.caseId ? (titles.get(i.caseId) ?? null) : null })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalAmount: fromCents(amountSum),
    totalRemaining: fromCents(amountSum - paidSum),
  };
}

export async function getEntry(ctx: TenantContext, id: string) {
  assertCan(ctx, "finance:read");
  const entry = await db.financeEntry.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  if (!entry) throw new NotFoundError("Lançamento não encontrado.");
  const [client, titles, account, category, costCenter, names] = await Promise.all([
    entry.clientId ? db.client.findFirst({ where: { id: entry.clientId, organizationId: ctx.organizationId }, select: { id: true, name: true } }) : null,
    visibleCaseTitles(ctx, [entry.caseId]),
    entry.accountId ? db.financeAccount.findFirst({ where: { id: entry.accountId, organizationId: ctx.organizationId }, select: { name: true } }) : null,
    entry.categoryId ? db.financeCategory.findFirst({ where: { id: entry.categoryId, organizationId: ctx.organizationId }, select: { name: true } }) : null,
    entry.costCenterId ? db.costCenter.findFirst({ where: { id: entry.costCenterId, organizationId: ctx.organizationId }, select: { name: true } }) : null,
    userNames(ctx, [entry.createdById, entry.canceledById, ...entry.payments.flatMap((p) => [p.createdById, p.reversedById])]),
  ]);
  const accounts = new Map((await db.financeAccount.findMany({ where: { organizationId: ctx.organizationId, id: { in: entry.payments.map((p) => p.accountId) } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
  return {
    entry,
    client,
    caseTitle: entry.caseId ? (titles.get(entry.caseId) ?? null) : null,
    caseHidden: Boolean(entry.caseId && !titles.get(entry.caseId)),
    accountName: account?.name ?? null,
    categoryName: category?.name ?? null,
    costCenterName: costCenter?.name ?? null,
    names,
    paymentAccounts: accounts,
  };
}

// ---------- visão geral e relatórios ----------

type Money = string;
export type FinanceSummary = {
  receivableOpen: Money;
  receivableOverdue: Money;
  payableOpen: Money;
  payableOverdue: Money;
  receivedThisMonth: Money;
  paidThisMonth: Money;
};

export async function financeSummary(ctx: TenantContext): Promise<FinanceSummary> {
  assertCan(ctx, "finance:read");
  const today = todayYmd(ctx.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonthStart = addMonthsClamped(monthStart, 1);
  const org = ctx.organizationId;
  const open = await db.$queryRaw<{ kind: string; overdue: boolean; remaining: string }[]>`
    SELECT kind::text AS kind, (due_date < ${today}::date) AS overdue, COALESCE(SUM(amount - paid_amount), 0)::text AS remaining
    FROM finance_entries WHERE organization_id = ${org}::uuid AND status IN ('OPEN', 'PARTIAL')
    GROUP BY 1, 2`;
  const pay = await db.$queryRaw<{ kind: string; total: string }[]>`
    SELECT e.kind::text AS kind, COALESCE(SUM(p.amount), 0)::text AS total
    FROM finance_payments p JOIN finance_entries e ON e.id = p.entry_id AND e.organization_id = p.organization_id
    WHERE p.organization_id = ${org}::uuid AND p.reversed_at IS NULL AND p.paid_on >= ${monthStart}::date AND p.paid_on < ${nextMonthStart}::date
    GROUP BY e.kind`;
  const sum = (kind: string, overdueOnly: boolean | null) =>
    fromCents(open.filter((r) => r.kind === kind && (overdueOnly === null || r.overdue === overdueOnly)).reduce((a, r) => a + (toCents(r.remaining) ?? 0n), 0n));
  const paid = (kind: string) => fromCents(pay.filter((r) => r.kind === kind).reduce((a, r) => a + (toCents(r.total) ?? 0n), 0n));
  return {
    receivableOpen: sum("RECEIVABLE", null),
    receivableOverdue: sum("RECEIVABLE", true),
    payableOpen: sum("PAYABLE", null),
    payableOverdue: sum("PAYABLE", true),
    receivedThisMonth: paid("RECEIVABLE"),
    paidThisMonth: paid("PAYABLE"),
  };
}

/** Saldo de cada conta = saldo inicial + recebimentos − pagamentos (baixas não estornadas). */
export async function accountBalances(ctx: TenantContext) {
  assertCan(ctx, "finance:read");
  const rows = await db.$queryRaw<{ id: string; name: string; kind: string; active: boolean; balance: string }[]>`
    SELECT a.id::text AS id, a.name, a.kind::text AS kind, a.active,
      (a.initial_balance + COALESCE(SUM(CASE WHEN p.id IS NULL THEN 0 WHEN e.kind = 'RECEIVABLE' THEN p.amount ELSE -p.amount END), 0))::text AS balance
    FROM finance_accounts a
    LEFT JOIN finance_payments p ON p.account_id = a.id AND p.organization_id = a.organization_id AND p.reversed_at IS NULL
    LEFT JOIN finance_entries e ON e.id = p.entry_id AND e.organization_id = p.organization_id
    WHERE a.organization_id = ${ctx.organizationId}::uuid AND a.deleted_at IS NULL
    GROUP BY a.id ORDER BY a.name`;
  return rows;
}

export type CashflowMonth = { month: string; realizedIn: Money; realizedOut: Money; expectedIn: Money; expectedOut: Money };

/**
 * Fluxo de caixa mensal: `realized*` = baixas efetivas no mês; `expected*` = saldo em aberto com vencimento no mês
 * (vencidos de meses anteriores entram em `overdue`). Meses a partir do atual, `months` à frente (padrão 6), mais os 2 anteriores.
 */
export async function cashflow(ctx: TenantContext, months = 6) {
  assertCan(ctx, "finance:read");
  const today = todayYmd(ctx.timezone);
  const cur = `${today.slice(0, 7)}-01`;
  const first = addMonthsClamped(cur, -2);
  const last = addMonthsClamped(cur, Math.min(Math.max(months, 1), 24));
  const org = ctx.organizationId;
  const realized = await db.$queryRaw<{ m: string; kind: string; total: string }[]>`
    SELECT to_char(date_trunc('month', p.paid_on), 'YYYY-MM') AS m, e.kind::text AS kind, SUM(p.amount)::text AS total
    FROM finance_payments p JOIN finance_entries e ON e.id = p.entry_id AND e.organization_id = p.organization_id
    WHERE p.organization_id = ${org}::uuid AND p.reversed_at IS NULL AND p.paid_on >= ${first}::date AND p.paid_on < ${last}::date
    GROUP BY 1, 2`;
  const expected = await db.$queryRaw<{ m: string; kind: string; total: string }[]>`
    SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') AS m, kind::text AS kind, SUM(amount - paid_amount)::text AS total
    FROM finance_entries
    WHERE organization_id = ${org}::uuid AND status IN ('OPEN', 'PARTIAL') AND due_date >= ${cur}::date AND due_date < ${last}::date
    GROUP BY 1, 2`;
  const overdue = await db.$queryRaw<{ kind: string; total: string }[]>`
    SELECT kind::text AS kind, SUM(amount - paid_amount)::text AS total FROM finance_entries
    WHERE organization_id = ${org}::uuid AND status IN ('OPEN', 'PARTIAL') AND due_date < ${cur}::date GROUP BY 1`;
  const out: CashflowMonth[] = [];
  for (let i = -2; i < Math.min(Math.max(months, 1), 24); i++) {
    const m = addMonthsClamped(cur, i).slice(0, 7);
    const get = (rows: { m: string; kind: string; total: string }[], kind: string) => rows.find((r) => r.m === m && r.kind === kind)?.total ?? "0.00";
    out.push({ month: m, realizedIn: get(realized, "RECEIVABLE"), realizedOut: get(realized, "PAYABLE"), expectedIn: get(expected, "RECEIVABLE"), expectedOut: get(expected, "PAYABLE") });
  }
  const od = (k: string) => overdue.find((r) => r.kind === k)?.total ?? "0.00";
  return { months: out, overdueIn: od("RECEIVABLE"), overdueOut: od("PAYABLE"), today, nextWeek: addDays(today, 7) };
}

/** Quanto cada cliente (ou o escritório todo) tem em aberto/recebido — usado nas fichas de cliente e processo. */
export async function entryTotalsFor(ctx: TenantContext, scope: { clientId?: string; caseId?: string }) {
  assertCan(ctx, "finance:read");
  if (scope.caseId) {
    const ok = await db.case.findFirst({ where: { AND: [{ id: scope.caseId, organizationId: ctx.organizationId }, caseVisibility(ctx)] }, select: { id: true } });
    if (!ok) throw new NotFoundError("Processo não encontrado.");
  }
  const where: Prisma.FinanceEntryWhereInput = { organizationId: ctx.organizationId, status: { not: "CANCELED" }, ...(scope.clientId ? { clientId: scope.clientId } : {}), ...(scope.caseId ? { caseId: scope.caseId } : {}) };
  const rows = await db.financeEntry.groupBy({ by: ["kind"], where, _sum: { amount: true, paidAmount: true } });
  const pick = (k: string) => {
    const r = rows.find((x) => x.kind === k);
    const a = toCents(r?._sum.amount?.toString() ?? "0") ?? 0n;
    const p = toCents(r?._sum.paidAmount?.toString() ?? "0") ?? 0n;
    return { total: fromCents(a), paid: fromCents(p), remaining: fromCents(a - p) };
  };
  return { receivable: pick("RECEIVABLE"), payable: pick("PAYABLE") };
}

