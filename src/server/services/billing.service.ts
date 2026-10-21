import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { addOneMonth, asaas, asaasConfigFromEnv, BillingProviderError, centsToReais, paymentOutcome, reaisToCents, type AsaasConfig, type AsaasPayment } from "@/lib/billing/asaas";
import { logger } from "@/lib/logging/logger";
import { renderMail } from "@/lib/mail/layout";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { normalizeDocument, onlyDigits } from "@/lib/validation/br-documents";
import { normalizeEmail } from "@/lib/validation/email";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { enqueueMail } from "./mail-outbox.service";

const PENDING_PREFIX = "pending:";
const isRealSub = (id: string | null | undefined): id is string => !!id && !id.startsWith(PENDING_PREFIX);

export function billingConfig(): { config?: AsaasConfig; error?: string } {
  return asaasConfigFromEnv();
}
export const billingAvailable = () => billingConfig().config !== undefined;

function need(): AsaasConfig {
  const { config } = billingConfig();
  if (!config) throw new ConflictError("A cobrança automática não está ativada nesta instalação. Fale com a administração da plataforma.");
  return config;
}

async function requireMfa(userId: string) {
  const m = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!m?.enabledAt) throw new ConflictError("Ative a verificação em duas etapas em Minha conta para contratar ou cancelar o plano.");
}

function ymdInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const appLink = () => `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/configuracoes`;

/* ---------------- dados de cobrança ---------------- */

export type BillingProfileInput = { name: string; document: string; email: string };

export async function saveBillingProfile(ctx: TenantContext, input: BillingProfileInput) {
  assertCan(ctx, "billing:manage");
  const name = input.name.trim();
  if (name.length < 3 || name.length > 100) throw new ValidationError("Nome inválido.", { name: ["Informe o nome ou razão social (3 a 100 caracteres)."] });
  const digits = onlyDigits(input.document);
  const doc = digits.length === 11 ? normalizeDocument("PERSON", input.document) : normalizeDocument("COMPANY", input.document);
  if (!doc) throw new ValidationError("CPF/CNPJ inválido.", { document: ["Informe um CPF ou CNPJ válido."] });
  const email = normalizeEmail(input.email);
  if (!/^[^<>@\s,;]+@[^<>@\s,;]+\.[^<>@\s,;]+$/.test(email)) throw new ValidationError("E-mail inválido.", { email: ["Informe um e-mail válido."] });
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  if (!sub) throw new ConflictError("O escritório ainda não tem uma assinatura. Fale com a administração da plataforma.");
  if (sub.providerCustomerId) {
    const cfg = need();
    await asaas.updateCustomer(cfg, sub.providerCustomerId, { name, cpfCnpj: doc, email });
  }
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { organizationId: ctx.organizationId }, data: { billingName: name, billingDocument: doc, billingEmail: email } });
    await audit({ action: "billing.profile_update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "subscription", resourceId: ctx.organizationId, meta: ctx.meta }, tx);
  });
}

/* ---------------- visão geral ---------------- */

export async function getBillingOverview(ctx: TenantContext) {
  assertCan(ctx, "billing:manage");
  const cfg = billingConfig();
  const [sub, plans, invoices] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId: ctx.organizationId }, include: { plan: true } }),
    db.plan.findMany({ where: { isPublic: true }, orderBy: { priceCents: "asc" } }),
    db.billingInvoice.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { dueDate: "desc" }, take: 12 }),
  ]);
  return {
    available: cfg.config !== undefined,
    sandbox: cfg.config?.sandbox ?? false,
    plans: plans.map((p) => ({ key: p.key, name: p.name, description: p.description, priceCents: p.priceCents, maxUsers: p.maxUsers, maxStorageMb: p.maxStorageMb, maxAiTokensMonth: p.maxAiTokensMonth })),
    current: sub ? { planKey: sub.plan.key, planName: sub.plan.name, status: sub.status } : null,
    automatic: !!sub && !!sub.providerSubscriptionId,
    cancelRequestedAt: sub?.cancelRequestedAt ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    profile: sub ? { name: sub.billingName ?? "", document: sub.billingDocument ?? "", email: sub.billingEmail ?? "" } : { name: "", document: "", email: "" },
    invoices: invoices.map((i) => ({ id: i.id, status: i.status, valueCents: i.valueCents, dueDate: i.dueDate, paidAt: i.paidAt, invoiceUrl: i.invoiceUrl })),
  };
}

/* ---------------- contratar / trocar / cancelar ---------------- */

export async function contractPlan(ctx: TenantContext, planKey: string) {
  assertCan(ctx, "billing:manage");
  const cfg = need();
  await requireMfa(ctx.userId);
  const plan = await db.plan.findFirst({ where: { key: planKey, isPublic: true } });
  if (!plan) throw new ValidationError("Plano inexistente.", { planKey: ["Plano inexistente."] });
  if (plan.priceCents == null) throw new ConflictError(`O plano ${plan.name} ainda não tem preço definido para contratação automática. Fale com a administração da plataforma.`);
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  if (!sub) throw new ConflictError("O escritório ainda não tem uma assinatura. Fale com a administração da plataforma.");
  if (!sub.billingName || !sub.billingDocument || !sub.billingEmail) throw new ValidationError("Preencha os dados de cobrança antes de contratar.", { billing: ["Informe nome, CPF/CNPJ e e-mail de cobrança."] });
  const description = `LegalOS — plano ${plan.name}`;

  // Já tem cobrança automática: apenas troca o valor das próximas faturas.
  if (isRealSub(sub.providerSubscriptionId)) {
    if (sub.cancelRequestedAt) throw new ConflictError("A assinatura está com cancelamento solicitado. Aguarde o fim do período para contratar novamente.");
    await asaas.updateSubscription(cfg, sub.providerSubscriptionId, { value: centsToReais(plan.priceCents), description });
    await db.$transaction(async (tx) => {
      await tx.subscription.update({ where: { organizationId: ctx.organizationId }, data: { planId: plan.id } });
      await audit({ action: "billing.plan_change", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "subscription", resourceId: ctx.organizationId, metadata: { plan: plan.key }, meta: ctx.meta }, tx);
    });
    return { created: false };
  }

  // Reserva atômica: dois cliques simultâneos não criam duas assinaturas no provedor.
  const claim = `${PENDING_PREFIX}${randomUUID()}`;
  const claimed = await db.subscription.updateMany({ where: { organizationId: ctx.organizationId, providerSubscriptionId: null }, data: { providerSubscriptionId: claim } });
  if (claimed.count !== 1) throw new ConflictError("Já existe uma contratação em andamento para este escritório. Atualize a página.");
  try {
    let customerId = sub.providerCustomerId;
    if (!customerId) {
      customerId = (await asaas.createCustomer(cfg, { name: sub.billingName, cpfCnpj: sub.billingDocument, email: sub.billingEmail, externalReference: ctx.organizationId })).id;
      await db.subscription.update({ where: { organizationId: ctx.organizationId }, data: { providerCustomerId: customerId } });
    }
    const today = ymdInTz(new Date(), ctx.timezone);
    const candidates = [today, sub.status === "TRIALING" && sub.trialEndsAt ? ymdInTz(sub.trialEndsAt, ctx.timezone) : today, sub.status === "ACTIVE" && sub.currentPeriodEnd ? ymdInTz(sub.currentPeriodEnd, ctx.timezone) : today];
    const nextDueDate = candidates.sort().at(-1)!; // nunca antes de hoje; respeita o teste/período já vigente
    const created = await asaas.createSubscription(cfg, { customer: customerId, value: centsToReais(plan.priceCents), nextDueDate, description, externalReference: ctx.organizationId });
    await db.$transaction(async (tx) => {
      await tx.subscription.update({ where: { organizationId: ctx.organizationId }, data: { providerSubscriptionId: created.id, billingProvider: "asaas", planId: plan.id, cancelRequestedAt: null } });
      await audit({ action: "billing.contract", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "subscription", resourceId: ctx.organizationId, metadata: { plan: plan.key, nextDueDate }, meta: ctx.meta }, tx);
    });
    // A primeira fatura pode demorar a existir no provedor; quando existir já a mostramos (melhor esforço).
    await syncInvoices(cfg, ctx.organizationId, created.id).catch(() => undefined);
    return { created: true };
  } catch (e) {
    await db.subscription.updateMany({ where: { organizationId: ctx.organizationId, providerSubscriptionId: claim }, data: { providerSubscriptionId: null } });
    throw e instanceof BillingProviderError ? new ConflictError(e.message) : e;
  }
}

export async function cancelSubscription(ctx: TenantContext) {
  assertCan(ctx, "billing:manage");
  const cfg = need();
  await requireMfa(ctx.userId);
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  if (!sub || !isRealSub(sub.providerSubscriptionId)) throw new ConflictError("Este escritório não tem cobrança automática para cancelar.");
  try {
    await asaas.deleteSubscription(cfg, sub.providerSubscriptionId);
  } catch (e) {
    if (!(e instanceof BillingProviderError && e.status === 404)) throw e instanceof BillingProviderError ? new ConflictError(e.message) : e;
  }
  await markProviderCanceled(sub.organizationId, ctx.userId);
}

/** Aplica o efeito do cancelamento no provedor. Pago e vigente: mantém o acesso até o fim do período; senão, encerra já. */
async function markProviderCanceled(organizationId: string, userId: string | null) {
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  if (!sub) return;
  let data: Prisma.SubscriptionUpdateInput;
  if (sub.status === "ACTIVE") data = { cancelRequestedAt: sub.cancelRequestedAt ?? new Date() };
  else if (sub.status === "TRIALING") data = { providerSubscriptionId: null, cancelRequestedAt: null }; // o teste continua até o fim
  else data = { status: "CANCELED", providerSubscriptionId: null, cancelRequestedAt: null, currentPeriodEnd: null };
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { organizationId }, data });
    await audit({ action: "billing.cancel", organizationId, userId, resourceType: "subscription", resourceId: organizationId, metadata: { from: sub.status }, meta: {} }, tx);
  });
}

/* ---------------- faturas e situação (webhook / conciliação) ---------------- */

function invoiceData(p: AsaasPayment) {
  return {
    status: p.deleted ? "DELETED" : p.status,
    valueCents: reaisToCents(p.value),
    dueDate: new Date(`${p.dueDate}T00:00:00.000Z`),
    paidAt: p.paymentDate ? new Date(`${p.paymentDate}T12:00:00.000Z`) : null,
    invoiceUrl: p.invoiceUrl && /^https:\/\//.test(p.invoiceUrl) ? p.invoiceUrl : null,
    billingType: p.billingType ?? null,
  };
}
async function upsertInvoice(organizationId: string, p: AsaasPayment) {
  const d = invoiceData(p);
  await db.billingInvoice.upsert({ where: { providerPaymentId: p.id }, create: { organizationId, providerPaymentId: p.id, ...d }, update: d });
}
async function syncInvoices(cfg: AsaasConfig, organizationId: string, providerSubscriptionId: string) {
  const list = await asaas.listSubscriptionPayments(cfg, providerSubscriptionId);
  for (const p of list.data ?? []) await upsertInvoice(organizationId, p);
  return list.data ?? [];
}

async function notifyBilling(organizationId: string, kind: string, dedupeKey: string, content: Parameters<typeof renderMail>[0]) {
  const [sub, members] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId }, select: { billingEmail: true } }),
    db.membership.findMany({ where: { organizationId, status: "ACTIVE", role: { permissions: { has: "billing:manage" } } }, select: { user: { select: { email: true } } } }),
  ]);
  const to = [...new Set([sub?.billingEmail, ...members.map((m) => m.user.email)].filter((x): x is string => !!x).map((x) => x.toLowerCase()))];
  const mail = renderMail(content);
  for (const email of to) await enqueueMail({ organizationId, kind, to: email, subject: content.title, text: mail.text, html: mail.html, dedupeKey: `${dedupeKey}:${email}` });
}

/** Aplica o estado ATUAL (já confirmado no provedor) de uma fatura à assinatura do escritório. Idempotente. */
async function applyPayment(organizationId: string, p: AsaasPayment) {
  await upsertInvoice(organizationId, p);
  if (p.deleted) return;
  const outcome = paymentOutcome(p.status);
  if (outcome === "pending") return;
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  if (!sub) return;
  if (outcome === "paid") {
    const end = addOneMonth(p.dueDate);
    const periodEnd = sub.currentPeriodEnd && sub.currentPeriodEnd > end ? sub.currentPeriodEnd : end;
    if (sub.status === "CANCELED" && !isRealSub(sub.providerSubscriptionId)) return; // pagamento tardio de assinatura já encerrada: não reativa sozinho
    const changed = sub.status !== "ACTIVE" || sub.currentPeriodEnd?.getTime() !== periodEnd.getTime();
    if (changed) {
      await db.$transaction(async (tx) => {
        await tx.subscription.update({ where: { organizationId }, data: { status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: periodEnd } });
        await audit({ action: "billing.payment_confirmed", organizationId, userId: null, resourceType: "subscription", resourceId: organizationId, metadata: { payment: p.id, valueCents: reaisToCents(p.value), periodEnd }, meta: {} }, tx);
      });
      await notifyBilling(organizationId, "billing.paid", `paid:${p.id}`, {
        title: "Pagamento confirmado — LegalOS",
        paragraphs: [`Recebemos o pagamento de ${brl(reaisToCents(p.value))} (vencimento ${p.dueDate.split("-").reverse().join("/")}).`, `O plano do escritório está ativo até ${addOneMonth(p.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}.`],
        button: { label: "Ver plano e faturas", url: appLink() },
      });
    }
    return;
  }
  // atraso/estorno: só vale se esta for a fatura mais recente (um evento antigo e tardio não pode derrubar quem já pagou depois)
  const latest = await db.billingInvoice.findFirst({ where: { organizationId, status: { not: "DELETED" } }, orderBy: { dueDate: "desc" }, select: { providerPaymentId: true, dueDate: true } });
  if (latest && latest.providerPaymentId !== p.id && latest.dueDate > new Date(`${p.dueDate}T00:00:00.000Z`)) return;
  if (sub.status === "ACTIVE" || sub.status === "TRIALING") {
    await db.$transaction(async (tx) => {
      await tx.subscription.update({ where: { organizationId }, data: { status: "PAST_DUE" } });
      await audit({ action: "billing.payment_overdue", organizationId, userId: null, resourceType: "subscription", resourceId: organizationId, metadata: { payment: p.id, outcome }, meta: {} }, tx);
    });
    await notifyBilling(organizationId, "billing.overdue", `overdue:${p.id}`, {
      title: "Pagamento do LegalOS em atraso",
      paragraphs: [`A fatura de ${brl(reaisToCents(p.value))} com vencimento em ${p.dueDate.split("-").reverse().join("/")} não foi confirmada.`, "Seus dados continuam disponíveis. Regularize o pagamento para evitar a suspensão do envio de arquivos, convites e uso de IA caso o atraso continue."],
      button: p.invoiceUrl && /^https:\/\//.test(p.invoiceUrl) ? { label: "Pagar fatura", url: p.invoiceUrl } : { label: "Ver plano e faturas", url: appLink() },
    });
  }
}

/** "Atualizar situação": confere no provedor (útil se um aviso se perdeu). */
export async function refreshBilling(ctx: TenantContext) {
  assertCan(ctx, "billing:manage");
  const cfg = need();
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  if (!sub || !isRealSub(sub.providerSubscriptionId)) throw new ConflictError("Este escritório não tem cobrança automática.");
  await reconcile(cfg, ctx.organizationId, sub.providerSubscriptionId).catch((e) => {
    throw e instanceof BillingProviderError ? new ConflictError(e.message) : e;
  });
}

async function reconcile(cfg: AsaasConfig, organizationId: string, providerSubscriptionId: string) {
  const remote = await asaas.getSubscription(cfg, providerSubscriptionId).catch((e) => {
    if (e instanceof BillingProviderError && e.status === 404) return null;
    throw e;
  });
  if (!remote || remote.deleted || remote.status === "INACTIVE" || remote.status === "EXPIRED") {
    await markProviderCanceled(organizationId, null);
    return;
  }
  const payments = (await asaas.listSubscriptionPayments(cfg, providerSubscriptionId)).data ?? [];
  for (const p of payments) await upsertInvoice(organizationId, p);
  for (const p of [...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) await applyPayment(organizationId, p);
}

/* ---------------- webhook do Asaas ---------------- */

export class WebhookAuthError extends Error {}

function tokenOk(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type AsaasEvent = { id?: string; event?: string; payment?: { id?: string; subscription?: string | null }; subscription?: { id?: string } };

/**
 * Processa um aviso do Asaas. Não confia no conteúdo do aviso: confirma o estado consultando a API com a chave
 * (o token do aviso é apenas um segredo compartilhado). Cada evento é processado uma única vez; se algo falhar
 * (ex.: API fora do ar), o registro é desfeito e devolve erro para o Asaas tentar de novo.
 */
export async function handleAsaasWebhook(headerToken: string | null, body: unknown): Promise<{ status: "ok" | "duplicate" | "ignored" }> {
  const cfg = need();
  if (!tokenOk(headerToken, cfg.webhookToken)) throw new WebhookAuthError("Token inválido.");
  const ev = (body ?? {}) as AsaasEvent;
  const type = typeof ev.event === "string" ? ev.event.slice(0, 80) : "";
  if (!type) return { status: "ignored" };
  const entity = ev.payment?.id ?? ev.subscription?.id ?? "";
  const eventKey = (typeof ev.id === "string" && ev.id ? ev.id : `${type}:${entity}`).slice(0, 200);

  const handled = type.startsWith("PAYMENT_") || type === "SUBSCRIPTION_DELETED" || type === "SUBSCRIPTION_INACTIVATED";
  if (!handled || !entity) return { status: "ignored" };
  try {
    await db.billingEvent.create({ data: { eventKey, eventType: type } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: "duplicate" };
    throw e;
  }
  try {
    let organizationId: string | null = null;
    if (type.startsWith("PAYMENT_")) {
      const remote = await asaas.getPayment(cfg, ev.payment!.id!).catch((e) => {
        if (e instanceof BillingProviderError && e.status === 404) return null;
        throw e;
      });
      if (remote) {
        const sub = await db.subscription.findFirst({
          where: { OR: [...(remote.subscription ? [{ providerSubscriptionId: remote.subscription }] : []), { providerCustomerId: remote.customer }] },
          select: { organizationId: true },
        });
        organizationId = sub?.organizationId ?? null;
        if (organizationId) await applyPayment(organizationId, remote);
        else logger.warn("billing.webhook_unknown_customer", { payment: remote.id });
      }
    } else {
      const sub = await db.subscription.findUnique({ where: { providerSubscriptionId: ev.subscription!.id! }, select: { organizationId: true } });
      organizationId = sub?.organizationId ?? null;
      if (sub) await reconcile(cfg, sub.organizationId, ev.subscription!.id!);
    }
    if (organizationId) await db.billingEvent.update({ where: { eventKey }, data: { organizationId } });
    return { status: "ok" };
  } catch (e) {
    await db.billingEvent.deleteMany({ where: { eventKey } });
    throw e;
  }
}

/* ---------------- rotina diária ---------------- */

export type BillingSweepResult = { canceledAtPeriodEnd: number; reconciled: number; trialReminders: number; trialExpired: number; errors: number };

export async function runBillingSweep(now = new Date()): Promise<BillingSweepResult> {
  const out: BillingSweepResult = { canceledAtPeriodEnd: 0, reconciled: 0, trialReminders: 0, trialExpired: 0, errors: 0 };
  // 1) cancelamento pedido e período pago terminou
  const toCancel = await db.subscription.findMany({ where: { cancelRequestedAt: { not: null }, status: "ACTIVE", currentPeriodEnd: { lt: now } }, select: { organizationId: true } });
  for (const s of toCancel) {
    await db.$transaction(async (tx) => {
      await tx.subscription.update({ where: { organizationId: s.organizationId }, data: { status: "CANCELED", providerSubscriptionId: null, cancelRequestedAt: null } });
      await audit({ action: "billing.canceled_at_period_end", organizationId: s.organizationId, userId: null, resourceType: "subscription", resourceId: s.organizationId, meta: {} }, tx);
    });
    out.canceledAtPeriodEnd++;
  }
  // 2) avisos perdidos: pago vigente há mais de 5 dias do fim do período sem nova fatura confirmada → confere no provedor
  const { config } = billingConfig();
  if (config) {
    const stale = await db.subscription.findMany({ where: { providerSubscriptionId: { not: null }, cancelRequestedAt: null, status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: { lt: new Date(now.getTime() - 5 * 86_400_000) } }, select: { organizationId: true, providerSubscriptionId: true }, take: 20 });
    for (const s of stale) {
      if (!isRealSub(s.providerSubscriptionId)) continue;
      try {
        await reconcile(config, s.organizationId, s.providerSubscriptionId);
        out.reconciled++;
      } catch (e) {
        out.errors++;
        logger.error("billing.reconcile_failed", { org: s.organizationId, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  // 3) lembretes do teste (3 dias antes) e aviso de teste encerrado — um de cada por escritório/data de término
  const soon = await db.subscription.findMany({ where: { status: "TRIALING", trialEndsAt: { gt: now, lte: new Date(now.getTime() + 3 * 86_400_000) } }, select: { organizationId: true, trialEndsAt: true, providerSubscriptionId: true } });
  for (const s of soon) {
    const day = s.trialEndsAt!.toISOString().slice(0, 10);
    await notifyBilling(s.organizationId, "billing.trial_ending", `trial-ending:${s.organizationId}:${day}`, {
      title: "O período de teste do LegalOS está terminando",
      paragraphs: [`O teste do escritório termina em ${s.trialEndsAt!.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`, "Para continuar enviando arquivos, usando IA e convidando pessoas, contrate um plano. Seus dados nunca são apagados."],
      button: { label: "Escolher plano", url: appLink() },
    });
    out.trialReminders++;
  }
  const expired = await db.subscription.findMany({ where: { status: "TRIALING", trialEndsAt: { lte: now, gt: new Date(now.getTime() - 7 * 86_400_000) } }, select: { organizationId: true, trialEndsAt: true } });
  for (const s of expired) {
    const day = s.trialEndsAt!.toISOString().slice(0, 10);
    await notifyBilling(s.organizationId, "billing.trial_expired", `trial-expired:${s.organizationId}:${day}`, {
      title: "O período de teste do LegalOS terminou",
      paragraphs: ["Seus dados continuam disponíveis para consulta e download. Para voltar a enviar arquivos, usar IA e convidar pessoas, contrate um plano."],
      button: { label: "Escolher plano", url: appLink() },
    });
    out.trialExpired++;
  }
  return out;
}

