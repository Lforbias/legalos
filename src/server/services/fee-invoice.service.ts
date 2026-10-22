import { db } from "@/lib/db/client";
import { todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { fromCents, toCents } from "@/lib/finance/money";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { isUniqueViolation } from "./db-errors";

const m2 = (d: { toString(): string }) => fromCents(toCents(d.toString()) ?? 0n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Honorários a receber, com cliente, que ainda não entraram em nenhuma fatura — agrupados por cliente. */
export async function listToBill(ctx: TenantContext) {
  assertCan(ctx, "finance:read");
  const rows = await db.financeEntry.findMany({
    where: { organizationId: ctx.organizationId, kind: "RECEIVABLE", type: "FEE", status: { not: "CANCELED" }, invoiceId: null, clientId: { not: null } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, description: true, amount: true, dueDate: true, clientId: true, installmentNo: true, installmentTotal: true },
  });
  const ids = [...new Set(rows.map((r) => r.clientId!))];
  const clients = ids.length ? await db.client.findMany({ where: { id: { in: ids }, organizationId: ctx.organizationId }, select: { id: true, name: true } }) : [];
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const groups = ids.map((cid) => {
    const items = rows.filter((r) => r.clientId === cid);
    return {
      clientId: cid,
      clientName: names.get(cid) ?? "Cliente",
      total: fromCents(items.reduce((a, r) => a + (toCents(r.amount.toString()) ?? 0n), 0n)),
      items: items.map((r) => ({ id: r.id, description: r.description, amount: m2(r.amount), dueDate: r.dueDate, installment: r.installmentNo ? `${r.installmentNo}/${r.installmentTotal}` : null })),
    };
  });
  groups.sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR"));
  return groups;
}

/** Emite uma fatura reunindo honorários de UM cliente. Numeração sequencial por escritório. */
export async function issueInvoice(ctx: TenantContext, input: { clientId: string; entryIds: string[]; notes?: string }) {
  assertCan(ctx, "finance:write");
  const entryIds = [...new Set(input.entryIds)];
  if (!UUID.test(input.clientId) || entryIds.length === 0 || entryIds.some((i) => !UUID.test(i))) throw new ValidationError("Escolha ao menos um honorário.");
  const notes = input.notes?.trim().slice(0, 500) || null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const entries = await tx.financeEntry.findMany({ where: { id: { in: entryIds }, organizationId: ctx.organizationId } });
        if (entries.length !== entryIds.length) throw new NotFoundError("Lançamento não encontrado.");
        for (const e of entries) {
          if (e.kind !== "RECEIVABLE" || e.type !== "FEE") throw new ValidationError("Só honorários a receber entram em fatura.");
          if (e.status === "CANCELED") throw new ValidationError("Há lançamento cancelado na seleção.");
          if (e.invoiceId) throw new ConflictError("Um dos honorários já está em uma fatura.");
          if (e.clientId !== input.clientId) throw new ValidationError("Todos os honorários da fatura devem ser do mesmo cliente.");
        }
        const last = await tx.feeInvoice.aggregate({ where: { organizationId: ctx.organizationId }, _max: { number: true } });
        const total = entries.reduce((a, e) => a + (toCents(e.amount.toString()) ?? 0n), 0n);
        const inv = await tx.feeInvoice.create({
          data: { organizationId: ctx.organizationId, number: (last._max.number ?? 0) + 1, clientId: input.clientId, issuedOn: ymdToDate(todayYmd(ctx.timezone)), total: fromCents(total), notes, createdById: ctx.userId },
        });
        await tx.financeEntry.updateMany({ where: { id: { in: entryIds }, organizationId: ctx.organizationId }, data: { invoiceId: inv.id } });
        await audit({ action: "finance.invoice_issue", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "fee_invoice", resourceId: inv.id, metadata: { number: inv.number, total: fromCents(total), entries: entryIds.length }, meta: ctx.meta }, tx);
        return { id: inv.id, number: inv.number };
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 2) continue;
      throw e;
    }
  }
  throw new ConflictError("Não foi possível numerar a fatura. Tente novamente.");
}

/** Cancela a fatura (os honorários voltam a "a faturar"). Não cancela se algum item já recebeu baixa. */
export async function cancelInvoice(ctx: TenantContext, id: string, rawReason: string) {
  assertCan(ctx, "finance:write");
  const reason = rawReason.trim();
  if (reason.length < 3) throw new ValidationError("Informe o motivo.", { reason: ["Informe o motivo."] });
  await db.$transaction(async (tx) => {
    const inv = await tx.feeInvoice.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { entries: { select: { paidAmount: true } } } });
    if (!inv) throw new NotFoundError("Fatura não encontrada.");
    if (inv.canceledAt) throw new ConflictError("Fatura já cancelada.");
    if (inv.entries.some((e) => (toCents(e.paidAmount.toString()) ?? 0n) > 0n)) throw new ConflictError("Há baixa registrada nesta fatura. Estorne as baixas antes de cancelar.");
    await tx.financeEntry.updateMany({ where: { invoiceId: id, organizationId: ctx.organizationId }, data: { invoiceId: null } });
    await tx.feeInvoice.update({ where: { id }, data: { canceledAt: new Date(), canceledReason: reason.slice(0, 300) } });
    await audit({ action: "finance.invoice_cancel", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "fee_invoice", resourceId: id, meta: ctx.meta }, tx);
  });
}

export type InvoiceState = "ISSUED" | "PARTIAL" | "PAID" | "CANCELED";

export async function listInvoices(ctx: TenantContext, opts: { state?: InvoiceState | "ALL" } = {}) {
  assertCan(ctx, "finance:read");
  const rows = await db.feeInvoice.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { number: "desc" },
    take: 200,
    include: { entries: { orderBy: { dueDate: "asc" }, select: { id: true, description: true, amount: true, paidAmount: true, dueDate: true, status: true, boletoCode: true, boletoUrl: true } } },
  });
  const ids = [...new Set(rows.map((r) => r.clientId))];
  const clients = ids.length ? await db.client.findMany({ where: { id: { in: ids }, organizationId: ctx.organizationId }, select: { id: true, name: true } }) : [];
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const out = rows.map((r) => {
    const paid = r.entries.reduce((a, e) => a + (toCents(e.paidAmount.toString()) ?? 0n), 0n);
    const total = toCents(r.total.toString()) ?? 0n;
    const state: InvoiceState = r.canceledAt ? "CANCELED" : paid >= total && total > 0n ? "PAID" : paid > 0n ? "PARTIAL" : "ISSUED";
    return {
      id: r.id, number: r.number, clientId: r.clientId, clientName: names.get(r.clientId) ?? "Cliente", issuedOn: r.issuedOn, total: m2(r.total), paid: fromCents(paid), state, notes: r.notes, canceledReason: r.canceledReason,
      entries: r.entries.map((e) => ({ id: e.id, description: e.description, amount: m2(e.amount), dueDate: e.dueDate, status: e.status, boletoCode: e.boletoCode, boletoUrl: e.boletoUrl })),
    };
  });
  const want = opts.state ?? "ALL";
  return want === "ALL" ? out : out.filter((i) => i.state === want);
}

/**
 * Registra os dados do boleto de um lançamento (linha digitável e/ou link). O sistema NÃO emite boleto:
 * guarda o que o banco ou o provedor gerou, para aparecer no fluxo e na fatura.
 */
export async function setBoleto(ctx: TenantContext, entryId: string, input: { code?: string; url?: string }) {
  assertCan(ctx, "finance:write");
  const code = (input.code ?? "").replace(/[\s.\-]/g, "");
  const url = (input.url ?? "").trim();
  if (code && !/^\d{44,48}$/.test(code)) throw new ValidationError("Linha digitável inválida (44 a 48 números).", { code: ["Linha digitável inválida (44 a 48 números)."] });
  if (url) {
    let ok = false;
    try { ok = new URL(url).protocol === "https:"; } catch { ok = false; }
    if (!ok) throw new ValidationError("O link do boleto deve começar com https://", { url: ["O link do boleto deve começar com https://"] });
  }
  const res = await db.financeEntry.updateMany({
    where: { id: entryId, organizationId: ctx.organizationId, kind: "RECEIVABLE", status: { not: "CANCELED" } },
    data: { boletoCode: code || null, boletoUrl: url ? url.slice(0, 500) : null },
  });
  if (res.count === 0) throw new NotFoundError("Lançamento não encontrado.");
  await audit({ action: "finance.boleto_set", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_entry", resourceId: entryId, meta: ctx.meta });
}

/** Boletos em aberto (com link ou linha digitável) — aparecem no fluxo de caixa. */
export async function listOpenBoletos(ctx: TenantContext) {
  assertCan(ctx, "finance:read");
  const rows = await db.financeEntry.findMany({
    where: { organizationId: ctx.organizationId, kind: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] }, OR: [{ boletoCode: { not: null } }, { boletoUrl: { not: null } }] },
    orderBy: { dueDate: "asc" },
    take: 100,
    select: { id: true, description: true, amount: true, paidAmount: true, dueDate: true, boletoCode: true, boletoUrl: true },
  });
  return rows.map((r) => ({ ...r, remaining: fromCents((toCents(r.amount.toString()) ?? 0n) - (toCents(r.paidAmount.toString()) ?? 0n)) }));
}
