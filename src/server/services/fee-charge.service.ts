import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AsaasConfig } from "@/lib/billing/asaas";
import { asaas, BillingProviderError, paymentOutcome } from "@/lib/billing/asaas";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { fromCents, toCents } from "@/lib/finance/money";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { decryptSecret, encryptSecret, mfaKey } from "@/lib/security/totp";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { appUrl } from "./auth.service";
import { notify } from "./notification.service";

/**
 * 5.0-F3 — cobrança de honorários por Pix e boleto na conta Asaas DO ESCRITÓRIO, com baixa automática pelo aviso do Asaas.
 * Nasce desligada. Só gera cobrança quando uma pessoa clica; o sistema NÃO envia o link ao cliente por conta própria.
 * Escrito pela documentação pública e testado contra servidor simulado: use a SANDBOX antes de cobrar de verdade.
 */
const key = () => {
  const k = mfaKey();
  if (!k) throw new ConflictError("A chave de cifra do sistema (MFA_ENCRYPTION_KEY) não está configurada.");
  return k;
};
const BASE = { sandbox: "https://api-sandbox.asaas.com/v3", prod: "https://api.asaas.com/v3" };

export type FetchLike = typeof fetch;
let fetchOverride: FetchLike | undefined;
/** Só para testes. */
export function __setFeeFetchForTests(f: FetchLike | undefined) { fetchOverride = f; }
let baseOverride: string | undefined;
export function __setFeeBaseForTests(b: string | undefined) { baseOverride = b; }

async function loadConfig(orgId: string, opts: { requireEnabled: boolean }): Promise<{ cfg: AsaasConfig; accountId: string | null }> {
  const row = await db.feeAsaasConfig.findUnique({ where: { organizationId: orgId } });
  if (!row) throw new ConflictError("Cobrança por Pix e boleto não configurada. Cadastre a chave do Asaas em Financeiro → Cobrança.");
  if (opts.requireEnabled && !row.enabled) throw new ConflictError("A cobrança por Pix e boleto está desligada. Ligue em Financeiro → Cobrança.");
  return { cfg: { apiKey: decryptSecret(row.apiKeyEnc, key()), webhookToken: row.webhookToken, baseUrl: baseOverride ?? (row.sandbox ? BASE.sandbox : BASE.prod), sandbox: row.sandbox }, accountId: row.accountId };
}

export async function getFeeAsaasStatus(ctx: TenantContext) {
  assertCan(ctx, "finance:manage");
  const row = await db.feeAsaasConfig.findUnique({ where: { organizationId: ctx.organizationId } });
  return row ? { configured: true, enabled: row.enabled, sandbox: row.sandbox, accountId: row.accountId, webhookUrl: appUrl(`/api/webhooks/fees/${ctx.organizationId}`), webhookToken: row.webhookToken } : { configured: false, enabled: false, sandbox: true, accountId: null, webhookUrl: appUrl(`/api/webhooks/fees/${ctx.organizationId}`), webhookToken: null };
}

export async function saveFeeAsaasConfig(ctx: TenantContext, input: { apiKey?: string; sandbox: boolean; accountId: string }) {
  assertCan(ctx, "finance:manage");
  const account = await db.financeAccount.findFirst({ where: { id: input.accountId, organizationId: ctx.organizationId, deletedAt: null, active: true }, select: { id: true } });
  if (!account) throw new ValidationError("Escolha a conta onde os recebimentos serão baixados.", { accountId: ["Conta inválida."] });
  const existing = await db.feeAsaasConfig.findUnique({ where: { organizationId: ctx.organizationId } });
  const apiKey = input.apiKey?.trim();
  if (!existing && !apiKey) throw new ValidationError("Informe a chave de API do Asaas.", { apiKey: ["Informe a chave."] });
  if (apiKey && (apiKey.length < 20 || apiKey.length > 300 || /\s/.test(apiKey))) throw new ValidationError("A chave de API parece inválida.", { apiKey: ["Chave inválida."] });
  const data = { sandbox: input.sandbox, accountId: input.accountId, updatedById: ctx.userId, ...(apiKey ? { apiKeyEnc: encryptSecret(apiKey, key()) } : {}) };
  if (existing) await db.feeAsaasConfig.update({ where: { organizationId: ctx.organizationId }, data: { ...data, ...(apiKey ? { enabled: false } : {}) } });
  else await db.feeAsaasConfig.create({ data: { organizationId: ctx.organizationId, webhookToken: randomBytes(24).toString("hex"), apiKeyEnc: encryptSecret(apiKey!, key()), sandbox: input.sandbox, accountId: input.accountId, updatedById: ctx.userId } });
  await audit({ action: "finance.fee_asaas_config", organizationId: ctx.organizationId, userId: ctx.userId, metadata: { sandbox: input.sandbox, keyChanged: !!apiKey }, meta: ctx.meta });
}

export async function testFeeAsaas(ctx: TenantContext) {
  assertCan(ctx, "finance:manage");
  const { cfg } = await loadConfig(ctx.organizationId, { requireEnabled: false });
  try {
    await asaas.ping(cfg, fetchOverride);
    return { ok: true as const };
  } catch (e) {
    if (e instanceof BillingProviderError) throw new ConflictError(e.message);
    throw e;
  }
}

export async function setFeeAsaasEnabled(ctx: TenantContext, on: boolean) {
  assertCan(ctx, "finance:manage");
  const row = await db.feeAsaasConfig.findUnique({ where: { organizationId: ctx.organizationId } });
  if (!row) throw new ConflictError("Cadastre a chave do Asaas antes de ligar.");
  if (on && !row.accountId) throw new ConflictError("Escolha a conta de baixa antes de ligar.");
  await db.feeAsaasConfig.update({ where: { organizationId: ctx.organizationId }, data: { enabled: on, updatedById: ctx.userId } });
  await audit({ action: on ? "finance.fee_asaas_on" : "finance.fee_asaas_off", organizationId: ctx.organizationId, userId: ctx.userId, meta: ctx.meta });
}

const m2 = (d: { toString(): string }) => fromCents(toCents(d.toString()) ?? 0n);

export async function createFeeCharge(ctx: TenantContext, entryId: string, billingType: "PIX" | "BOLETO") {
  assertCan(ctx, "finance:write");
  if (billingType !== "PIX" && billingType !== "BOLETO") throw new ValidationError("Escolha Pix ou boleto.");
  const { cfg } = await loadConfig(ctx.organizationId, { requireEnabled: true });
  const entry = await db.financeEntry.findFirst({ where: { id: entryId, organizationId: ctx.organizationId, kind: "RECEIVABLE" } });
  if (!entry) throw new NotFoundError("Lançamento a receber não encontrado.");
  if (entry.status !== "OPEN" && entry.status !== "PARTIAL") throw new ConflictError("Só dá para cobrar lançamento em aberto.");
  if (!entry.clientId) throw new ValidationError("O lançamento precisa ter um cliente para gerar a cobrança.");
  const open = await db.feeCharge.findFirst({ where: { organizationId: ctx.organizationId, entryId, status: "PENDING" }, select: { id: true } });
  if (open) throw new ConflictError("Já existe uma cobrança em aberto para este lançamento. Cancele-a antes de gerar outra.");
  const client = await db.client.findFirst({ where: { id: entry.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, document: true, email: true } });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  const doc = (client.document ?? "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) throw new ValidationError("O cliente precisa ter CPF ou CNPJ cadastrado para gerar a cobrança.");
  const cents = (toCents(entry.amount.toString()) ?? 0n) - (toCents(entry.paidAmount.toString()) ?? 0n);
  if (cents <= 0n) throw new ConflictError("Não há saldo a cobrar.");
  const today = todayYmd(ctx.timezone);
  const due = entry.dueDate.toISOString().slice(0, 10);
  const dueDate = due < today ? today : due;
  try {
    const found = await asaas.findCustomerByReference(cfg, client.id, fetchOverride);
    const customer = found.data[0]?.id ?? (await asaas.createCustomer(cfg, { name: client.name, cpfCnpj: doc, email: client.email ?? "", externalReference: client.id }, fetchOverride)).id;
    const pay = await asaas.createPayment(cfg, { customer, billingType, value: Number(cents) / 100, dueDate, description: entry.description.slice(0, 200), externalReference: entry.id }, fetchOverride);
    let pix: { encodedImage: string; payload: string } | null = null;
    if (billingType === "PIX") pix = await asaas.getPixQrCode(cfg, pay.id, fetchOverride);
    const row = await db.feeCharge.create({
      data: { organizationId: ctx.organizationId, entryId, clientId: client.id, asaasPaymentId: pay.id, billingType, value: fromCents(cents), dueDate: ymdToDate(dueDate), invoiceUrl: pay.invoiceUrl ?? null, boletoUrl: pay.bankSlipUrl ?? null, pixPayload: pix?.payload ?? null, pixImage: pix?.encodedImage ?? null, createdById: ctx.userId },
      select: { id: true },
    });
    if (billingType === "BOLETO" && pay.bankSlipUrl) await db.financeEntry.update({ where: { id: entryId }, data: { boletoUrl: pay.bankSlipUrl } });
    await audit({ action: "finance.fee_charge_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "finance_entry", resourceId: entryId, metadata: { billingType, chargeId: row.id }, meta: ctx.meta });
    return row;
  } catch (e) {
    if (e instanceof BillingProviderError) throw new ConflictError(e.message);
    throw e;
  }
}

export async function listFeeCharges(ctx: TenantContext, entryId: string) {
  assertCan(ctx, "finance:read");
  const rows = await db.feeCharge.findMany({ where: { organizationId: ctx.organizationId, entryId }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ ...r, value: m2(r.value) }));
}

export async function cancelFeeCharge(ctx: TenantContext, chargeId: string) {
  assertCan(ctx, "finance:write");
  const ch = await db.feeCharge.findFirst({ where: { id: chargeId, organizationId: ctx.organizationId } });
  if (!ch) throw new NotFoundError("Cobrança não encontrada.");
  if (ch.status !== "PENDING" && ch.status !== "OVERDUE") throw new ConflictError("Só dá para cancelar cobrança em aberto.");
  const { cfg } = await loadConfig(ctx.organizationId, { requireEnabled: false });
  try {
    await asaas.deletePayment(cfg, ch.asaasPaymentId, fetchOverride);
  } catch (e) {
    if (e instanceof BillingProviderError && e.status !== 404) throw new ConflictError(e.message);
  }
  await db.feeCharge.update({ where: { id: ch.id }, data: { status: "CANCELED" } });
  await audit({ action: "finance.fee_charge_cancel", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "fee_charge", resourceId: ch.id, meta: ctx.meta });
}

// ---------------- aviso do Asaas ----------------
export class FeeWebhookAuthError extends Error {}

/** Processa o aviso do Asaas (idempotente). Baixa automática só quando o status é de dinheiro recebido. */
export async function handleFeeWebhook(orgId: string, token: string | null, body: unknown): Promise<{ status: string }> {
  const cfg = await db.feeAsaasConfig.findUnique({ where: { organizationId: orgId } });
  const given = Buffer.from(token ?? "");
  const want = Buffer.from(cfg?.webhookToken ?? "");
  if (!cfg || given.length === 0 || given.length !== want.length || !timingSafeEqual(given, want)) throw new FeeWebhookAuthError();
  if (!cfg.enabled) return { status: "ignored_disabled" };
  const p = (body as { payment?: { id?: string; status?: string; value?: number; paymentDate?: string } } | null)?.payment;
  if (!p?.id || typeof p.id !== "string") return { status: "ignored_no_payment" };
  const ch = await db.feeCharge.findFirst({ where: { organizationId: orgId, asaasPaymentId: p.id } });
  if (!ch) return { status: "ignored_unknown" };
  const outcome = paymentOutcome(String(p.status ?? ""));
  if (outcome === "overdue") {
    if (ch.status === "PENDING") await db.feeCharge.update({ where: { id: ch.id }, data: { status: "OVERDUE" } });
    return { status: "overdue" };
  }
  if (outcome === "revoked") {
    await db.feeCharge.update({ where: { id: ch.id }, data: { status: "REFUNDED" } });
    await audit({ action: "finance.fee_charge_refunded", organizationId: orgId, resourceType: "fee_charge", resourceId: ch.id, metadata: { asaasStatus: p.status }, meta: undefined });
    const admins = await db.membership.findMany({ where: { organizationId: orgId, role: { key: { in: ["OWNER", "ADMIN"] } } }, select: { userId: true }, take: 5 });
    await notify(admins.map((a) => ({ organizationId: orgId, userId: a.userId, kind: "finance", title: "Cobrança estornada no Asaas: confira a baixa do lançamento", link: `/financeiro/lancamentos/${ch.entryId}`, dedupeKey: `feerefund:${ch.id}:${a.userId}` })));
    return { status: "refunded" };
  }
  if (outcome !== "paid") return { status: "pending" };
  if (ch.status === "PAID") return { status: "already_paid" };
  if (!cfg.accountId) {
    logger.error("fee.webhook_no_account", { orgId });
    throw new Error("Conta de baixa não configurada.");
  }
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(p.paymentDate ?? "") ? p.paymentDate! : new Date().toISOString().slice(0, 10);
  await db.$transaction(async (tx) => {
    const claimed = await tx.feeCharge.updateMany({ where: { id: ch.id, status: { not: "PAID" } }, data: { status: "PAID", paidAt: new Date() } });
    if (claimed.count === 0) return; // outro aviso já baixou
    const entry = await tx.financeEntry.findFirst({ where: { id: ch.entryId, organizationId: orgId }, select: { amount: true, paidAmount: true, status: true } });
    if (!entry || entry.status === "CANCELED" || entry.status === "PAID") return;
    const remaining = (toCents(entry.amount.toString()) ?? 0n) - (toCents(entry.paidAmount.toString()) ?? 0n);
    const pay = (toCents(ch.value.toString()) ?? 0n) < remaining ? (toCents(ch.value.toString()) ?? 0n) : remaining;
    if (pay <= 0n) return;
    const amt = fromCents(pay);
    await tx.$executeRaw`UPDATE finance_entries SET paid_amount = paid_amount + ${amt}::numeric,
      status = CASE WHEN paid_amount + ${amt}::numeric >= amount THEN 'PAID'::"FinanceEntryStatus" ELSE 'PARTIAL'::"FinanceEntryStatus" END, updated_at = now()
      WHERE id = ${ch.entryId}::uuid AND organization_id = ${orgId}::uuid`;
    await tx.financePayment.create({ data: { organizationId: orgId, entryId: ch.entryId, accountId: cfg.accountId!, amount: amt, paidOn: ymdToDate(paidOn), method: ch.billingType === "PIX" ? "PIX" : "Boleto", note: `Baixa automática (Asaas ${ch.asaasPaymentId})`, createdById: null } });
    await audit({ action: "finance.fee_charge_paid", organizationId: orgId, resourceType: "finance_entry", resourceId: ch.entryId, metadata: { chargeId: ch.id, amount: amt }, meta: undefined }, tx);
  });
  return { status: "paid" };
}

// ---------------- contratos de êxito ----------------
export type FeeContractInput = { clientId: string; caseId?: string | null; title: string; percent?: string | null; fixedAmount?: string | null; baseNote?: string; expectedBase?: string | null; notes?: string };

export async function createFeeContract(ctx: TenantContext, i: FeeContractInput) {
  assertCan(ctx, "finance:write");
  const title = i.title.trim().slice(0, 160);
  if (!title) throw new ValidationError("Informe o título do contrato.", { title: ["Informe o título."] });
  if (!i.percent && !i.fixedAmount) throw new ValidationError("Informe o percentual de êxito ou um valor fixo.");
  if (i.percent && !/^\d{1,3}(\.\d{1,4})?$/.test(i.percent)) throw new ValidationError("Percentual inválido.", { percent: ["Percentual inválido."] });
  if (i.percent && Number(i.percent) > 100) throw new ValidationError("O percentual não pode passar de 100.", { percent: ["Máximo 100."] });
  const client = await db.client.findFirst({ where: { id: i.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } });
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  const row = await db.feeContract.create({
    data: { organizationId: ctx.organizationId, clientId: client.id, caseId: i.caseId ?? null, title, percent: i.percent ?? null, fixedAmount: i.fixedAmount ?? null, baseNote: i.baseNote?.trim().slice(0, 300) || null, expectedBase: i.expectedBase ?? null, notes: i.notes?.trim().slice(0, 1000) || null, createdById: ctx.userId },
    select: { id: true },
  });
  await audit({ action: "finance.fee_contract_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "fee_contract", resourceId: row.id, meta: ctx.meta });
  return row;
}

/** Valor do êxito: percentual × base (arredondado em centavos) ou o valor fixo. */
export function successFee(c: { percent: { toString(): string } | null; fixedAmount: { toString(): string } | null }, base: string | null): string | null {
  if (c.fixedAmount) return m2(c.fixedAmount);
  if (!c.percent || base === null) return null;
  const b = toCents(base);
  if (b === null) return null;
  const [ip, fp = ""] = c.percent.toString().split(".");
  const bp = BigInt(ip!) * 10000n + BigInt(fp.padEnd(4, "0").slice(0, 4));
  return fromCents((b * bp + 500000n) / 1000000n);
}

export async function listFeeContracts(ctx: TenantContext, opts: { caseId?: string } = {}) {
  assertCan(ctx, "finance:read");
  const rows = await db.feeContract.findMany({ where: { organizationId: ctx.organizationId, ...(opts.caseId ? { caseId: opts.caseId } : {}), status: { not: "CANCELED" } }, orderBy: { createdAt: "desc" }, take: 200 });
  const ids = [...new Set(rows.map((r) => r.clientId))];
  const clients = ids.length ? await db.client.findMany({ where: { id: { in: ids }, organizationId: ctx.organizationId }, select: { id: true, name: true } }) : [];
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const list = rows.map((r) => ({ ...r, clientName: names.get(r.clientId) ?? "Cliente", expected: r.status === "ACTIVE" ? successFee(r, r.expectedBase ? m2(r.expectedBase) : null) : null }));
  const expectedTotal = list.reduce((a, r) => a + (r.expected ? (toCents(r.expected) ?? 0n) : 0n), 0n);
  return { items: list, expectedTotal: fromCents(expectedTotal) };
}

/** O êxito aconteceu: informa o valor-base realmente obtido e gera o honorário a receber (rascunho de cobrança fica por conta de uma pessoa). */
export async function triggerFeeContract(ctx: TenantContext, id: string, input: { base?: string; dueDate: string }) {
  assertCan(ctx, "finance:write");
  const c = await db.feeContract.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw new NotFoundError("Contrato não encontrado.");
  if (c.status !== "ACTIVE") throw new ConflictError("Este contrato já foi acionado ou cancelado.");
  if (!c.fixedAmount && !input.base) throw new ValidationError("Informe o valor obtido no processo (base do êxito).", { base: ["Informe o valor obtido."] });
  const fee = successFee(c, input.base ?? null);
  if (!fee || (toCents(fee) ?? 0n) <= 0n) throw new ValidationError("Não foi possível calcular o honorário com esses dados.");
  const today = todayYmd(ctx.timezone);
  const entry = await db.$transaction(async (tx) => {
    const claimed = await tx.feeContract.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "TRIGGERED", triggeredAt: new Date(), triggeredBase: input.base ?? null } });
    if (claimed.count === 0) throw new ConflictError("Este contrato já foi acionado.");
    const e = await tx.financeEntry.create({ data: { organizationId: ctx.organizationId, kind: "RECEIVABLE", type: "FEE", description: `Honorários de êxito — ${c.title}`, amount: fee, issueDate: ymdToDate(today), dueDate: ymdToDate(input.dueDate), clientId: c.clientId, caseId: c.caseId, createdById: ctx.userId }, select: { id: true } });
    await tx.feeContract.update({ where: { id }, data: { entryId: e.id } });
    await audit({ action: "finance.fee_contract_trigger", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "fee_contract", resourceId: id, metadata: { fee, entryId: e.id }, meta: ctx.meta }, tx);
    return e;
  });
  return { entryId: entry.id, fee };
}

export async function cancelFeeContract(ctx: TenantContext, id: string) {
  assertCan(ctx, "finance:write");
  const r = await db.feeContract.updateMany({ where: { id, organizationId: ctx.organizationId, status: "ACTIVE" }, data: { status: "CANCELED" } });
  if (r.count === 0) throw new NotFoundError("Contrato ativo não encontrado.");
  await audit({ action: "finance.fee_contract_cancel", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "fee_contract", resourceId: id, meta: ctx.meta });
}
