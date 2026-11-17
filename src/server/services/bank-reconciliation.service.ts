import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { toCents } from "@/lib/finance/money";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { parseStatementCsv, type StatementMapping } from "@/lib/finance/statement-csv";
import { todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { caseVisibility } from "./case.service";

const MAX_CSV_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 5000;

export async function importStatementCsv(ctx: TenantContext, input: { accountId: string; fileName: string; content: string; mapping: StatementMapping }) {
  assertCan(ctx, "finance:write");
  if (Buffer.byteLength(input.content, "utf8") > MAX_CSV_BYTES) throw new ValidationError("O extrato deve ter até 8 MB.");
  const account = await db.financeAccount.findFirst({
    where: { id: input.accountId, organizationId: ctx.organizationId, deletedAt: null, active: true },
    select: { id: true },
  });
  if (!account) throw new NotFoundError("Conta financeira não encontrada ou inativa.");
  const parsed = parseStatementCsv(input.content, input.mapping, account.id);
  if (parsed.lines.length + parsed.invalidCount + parsed.duplicateCount > MAX_ROWS) throw new ValidationError(`O extrato pode conter até ${MAX_ROWS} linhas.`);
  if (parsed.lines.length === 0) throw new ValidationError("Nenhuma linha válida para importar. Confira o mapeamento das colunas.");

  return db.$transaction(async (tx) => {
    const statement = await tx.bankStatementImport.create({
      data: {
        id: randomUUID(),
        organizationId: ctx.organizationId,
        accountId: account.id,
        fileName: input.fileName.replace(/[\\/\u0000-\u001f]/g, "").slice(0, 200) || "extrato.csv",
        importedById: ctx.userId,
        rowCount: 0,
        duplicateCount: parsed.duplicateCount,
        invalidCount: parsed.invalidCount,
      },
      select: { id: true },
    });
    const created = await tx.bankStatementLine.createMany({
      data: parsed.lines.map((line) => ({
        id: randomUUID(),
        organizationId: ctx.organizationId,
        importId: statement.id,
        fingerprint: line.fingerprint,
        postedOn: ymdToDate(line.postedOn),
        description: line.description,
        amount: line.amount,
        direction: line.direction,
      })),
      skipDuplicates: true,
    });
    const duplicateCount = parsed.duplicateCount + parsed.lines.length - created.count;
    await tx.bankStatementImport.update({ where: { id: statement.id }, data: { rowCount: created.count, duplicateCount } });
    await audit({
      action: "finance.bank_statement_import",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceType: "bank_statement_import",
      resourceId: statement.id,
      metadata: { imported: created.count, duplicates: duplicateCount, invalid: parsed.invalidCount },
      meta: ctx.meta,
    }, tx);
    return { id: statement.id, imported: created.count, duplicates: duplicateCount, invalid: parsed.invalidCount };
  });
}

export async function listStatementImports(ctx: TenantContext) {
  assertCan(ctx, "finance:read");
  return db.bankStatementImport.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 20,
      select: { id: true, fileName: true, rowCount: true, duplicateCount: true, invalidCount: true, createdAt: true, account: { select: { name: true } }, _count: { select: { lines: true } } },
  });
}

export async function getStatementImport(ctx: TenantContext, importId: string) {
  assertCan(ctx, "finance:read");
  const statement = await db.bankStatementImport.findFirst({
    where: { id: importId, organizationId: ctx.organizationId },
    select: { id: true, fileName: true, rowCount: true, duplicateCount: true, invalidCount: true, createdAt: true, accountId: true, account: { select: { name: true } } },
  });
  if (!statement) throw new NotFoundError("Importação do extrato não encontrada.");
  const lines = await db.bankStatementLine.findMany({
    where: { importId, organizationId: ctx.organizationId },
    orderBy: [{ status: "asc" }, { postedOn: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: { id: true, postedOn: true, description: true, amount: true, direction: true, status: true, matchedEntryId: true, paymentId: true },
  });
  const pending = lines.filter((line) => line.status === "PENDING");
  const dates = pending.map((line) => line.postedOn.getTime());
  const range = dates.length ? 30 * 86400_000 : 0;
  const min = dates.length ? new Date(Math.min(...dates) - range) : new Date(0);
  const max = dates.length ? new Date(Math.max(...dates) + range) : new Date(0);
  const visibleCaseIds = can(ctx, "cases:read") ? await db.case.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] },
    select: { id: true },
    take: 10000,
  }) : [];
  const entries = pending.length ? await db.financeEntry.findMany({
    where: { AND: [
      { organizationId: ctx.organizationId, kind: { in: [...new Set(pending.map((line) => line.direction))] }, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { gte: min, lte: max } },
      { OR: [{ accountId: null }, { accountId: statement.accountId }] },
      { OR: [{ caseId: null }, { caseId: { in: visibleCaseIds.map((item) => item.id) } }] },
    ] },
    orderBy: { dueDate: "desc" },
    take: 2000,
    select: { id: true, kind: true, description: true, amount: true, paidAmount: true, dueDate: true, counterparty: true },
  }) : [];
  const candidates = new Map<string, typeof entries>();
  for (const line of pending) {
    const lineCents = toCents(line.amount.toString());
    if (lineCents === null) continue;
    const matches = entries.filter((entry) => {
      if (entry.kind !== line.direction) return false;
      const amount = toCents(entry.amount.toString());
      const paid = toCents(entry.paidAmount.toString());
      return amount !== null && paid !== null && amount - paid >= lineCents;
    }).sort((a, b) => {
      const exactA = toCents(a.amount.toString())! - toCents(a.paidAmount.toString())! === lineCents ? 0 : 1;
      const exactB = toCents(b.amount.toString())! - toCents(b.paidAmount.toString())! === lineCents ? 0 : 1;
      return exactA - exactB || Math.abs(a.dueDate.getTime() - line.postedOn.getTime()) - Math.abs(b.dueDate.getTime() - line.postedOn.getTime());
    }).slice(0, 5);
    candidates.set(line.id, matches);
  }
  return { statement, lines: lines.map((line) => ({ ...line, candidates: candidates.get(line.id) ?? [] })) };
}

export async function reconcileStatementLine(ctx: TenantContext, importId: string, lineId: string, entryId: string) {
  assertCan(ctx, "finance:write");
  return db.$transaction(async (tx) => {
    const line = await tx.bankStatementLine.findFirst({
      where: { id: lineId, importId, organizationId: ctx.organizationId },
      include: { import: { select: { accountId: true, fileName: true } } },
    });
    if (!line) throw new NotFoundError("Linha do extrato não encontrada.");
    if (line.status !== "PENDING") throw new ConflictError("Esta linha já foi conciliada ou ignorada.");
    if (line.postedOn > ymdToDate(todayYmd(ctx.timezone))) throw new ValidationError("A data do extrato não pode estar no futuro.");
    const entry = await tx.financeEntry.findFirst({
      where: { id: entryId, organizationId: ctx.organizationId, kind: line.direction, status: { in: ["OPEN", "PARTIAL"] }, OR: [{ accountId: null }, { accountId: line.import.accountId }] },
      select: { id: true, amount: true, paidAmount: true, caseId: true },
    });
    if (!entry) throw new NotFoundError("Lançamento compatível não encontrado.");
    if (entry.caseId && !(await tx.case.findFirst({ where: { AND: [{ id: entry.caseId, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] }, select: { id: true } }))) throw new NotFoundError("Lançamento compatível não encontrado.");
    const amount = toCents(line.amount.toString());
    const total = toCents(entry.amount.toString());
    const paid = toCents(entry.paidAmount.toString());
    if (amount === null || total === null || paid === null || amount <= 0n || amount > total - paid) throw new ConflictError("O valor do extrato excede o saldo pendente do lançamento.");
    const paidAmount = line.amount.toString();
    const claimed = await tx.bankStatementLine.updateMany({
      where: { id: line.id, organizationId: ctx.organizationId, status: "PENDING" },
      data: { status: "MATCHED", matchedEntryId: entry.id, matchedAt: new Date() },
    });
    if (!claimed.count) throw new ConflictError("Esta linha já foi conciliada ou ignorada.");
    const changed = await tx.$executeRaw`UPDATE finance_entries
      SET paid_amount = paid_amount + ${paidAmount}::numeric,
          status = CASE WHEN paid_amount + ${paidAmount}::numeric >= amount THEN 'PAID'::"FinanceEntryStatus" ELSE 'PARTIAL'::"FinanceEntryStatus" END,
          account_id = COALESCE(account_id, ${line.import.accountId}::uuid),
          updated_at = now()
      WHERE id = ${entry.id}::uuid AND organization_id = ${ctx.organizationId}::uuid AND status IN ('OPEN', 'PARTIAL') AND paid_amount + ${paidAmount}::numeric <= amount`;
    if (!changed) throw new ConflictError("O lançamento mudou enquanto você conciliava. Atualize a tela e tente novamente.");
    const payment = await tx.financePayment.create({
      data: { organizationId: ctx.organizationId, entryId: entry.id, accountId: line.import.accountId, amount: line.amount, paidOn: line.postedOn, note: `Conciliação do extrato ${line.import.fileName}`.slice(0, 500), createdById: ctx.userId },
      select: { id: true },
    });
    await tx.bankStatementLine.update({ where: { id: line.id }, data: { paymentId: payment.id } });
    await audit({ action: "finance.bank_statement_reconcile", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_payment", resourceId: payment.id, metadata: { entryId: entry.id, statementLineId: line.id, amount: paidAmount }, meta: ctx.meta }, tx);
    return { paymentId: payment.id };
  });
}

export async function ignoreStatementLine(ctx: TenantContext, importId: string, lineId: string) {
  assertCan(ctx, "finance:write");
  const result = await db.bankStatementLine.updateMany({ where: { id: lineId, importId, organizationId: ctx.organizationId, status: "PENDING" }, data: { status: "IGNORED" } });
  if (!result.count) throw new ConflictError("A linha já foi tratada. Atualize a tela.");
  await audit({ action: "finance.bank_statement_ignore", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "bank_statement_line", resourceId: lineId, meta: ctx.meta });
}
