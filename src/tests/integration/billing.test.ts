import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { billingAvailable, cancelSubscription, contractPlan, getBillingOverview, handleAsaasWebhook, refreshBilling, runBillingSweep, saveBillingProfile, WebhookAuthError } from "@/server/services/billing.service";
import { listPlans, updatePlan, type PlatformCtx } from "@/server/services/platform.service";
import { startFakeAsaas } from "./fake-asaas";
import { addMember, META, makeOrgWithOwner, makeUser } from "./helpers";

const TOKEN = "t".repeat(32);
const fake = startFakeAsaas();
const saved = { ...process.env };
const ymd = (d: Date, tz = "America/Sao_Paulo") => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const DAY = 86_400_000;
const CPF = "529.982.247-25"; // CPF de exemplo válido (dígitos verificadores corretos)

async function withMfa(userId: string, email: string) {
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}
const profile = { name: "Escritório Exemplo Ltda", document: CPF, email: "financeiro@exemplo.test" };
const sub = (orgId: string) => db.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });

describe("cobrança automática (Asaas simulado)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let planPro: { id: string; key: string };
  let planMax: { id: string; key: string };
  let planFree: { id: string; key: string };
  let pc: PlatformCtx;
  const evt = (event: string, payment: { id: string }, id = `evt_${randomUUID()}`) => ({ id, event, payment: { id: payment.id } });

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const url = await fake.start();
    Object.assign(process.env, { ASAAS_API_URL: url, ASAAS_API_KEY: "chave-de-teste", ASAAS_WEBHOOK_TOKEN: TOKEN, ASAAS_ENV: "sandbox" });
    const s = randomUUID().slice(0, 6);
    planPro = await db.plan.create({ data: { key: `pro-${s}`, name: "Pro", priceCents: 9900, maxUsers: 10, features: [], isPublic: true } });
    planMax = await db.plan.create({ data: { key: `max-${s}`, name: "Max", priceCents: 19900, features: [], isPublic: true } });
    planFree = await db.plan.create({ data: { key: `semprecp-${s}`, name: "Sob consulta", features: [], isPublic: true } });
    const admin = await makeUser("bill-admin");
    await withMfa(admin.id, admin.email);
    await db.platformAdmin.create({ data: { userId: admin.id } });
    pc = { userId: admin.id, meta: META };
  });
  afterAll(async () => {
    await fake.stop();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  beforeEach(() => { fake.state.down = false; fake.state.failNext = null; });

  describe("sem configuração", () => {
    it("fica desligada e recusa contratar", async () => {
      const keep = process.env.ASAAS_API_KEY;
      delete process.env.ASAAS_API_KEY;
      try {
        expect(billingAvailable()).toBe(false);
        const o = await makeOrgWithOwner("bill-off");
        await expect(contractPlan(o.ctx, planPro.key)).rejects.toThrow(/não está ativada/);
        await expect(handleAsaasWebhook(TOKEN, { event: "PAYMENT_RECEIVED" })).rejects.toBeInstanceOf(ConflictError);
      } finally {
        process.env.ASAAS_API_KEY = keep;
      }
      expect(billingAvailable()).toBe(true);
    });
  });

  describe("dados de cobrança e permissões", () => {
    beforeAll(async () => { A = await makeOrgWithOwner("bill-A"); await withMfa(A.owner.id, A.owner.email); });

    it("quem não tem billing:manage não vê nem contrata", async () => {
      const admin = await addMember(A.org.id, "ADMIN", "bill-adm"); // administrador não tem cobrança
      await expect(getBillingOverview(admin.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveBillingProfile(admin.ctx, profile)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(contractPlan(admin.ctx, planPro.key)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(cancelSubscription(admin.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    });
    it("valida CPF/CNPJ, e-mail e nome", async () => {
      await expect(saveBillingProfile(A.ctx, { ...profile, document: "111.111.111-11" })).rejects.toBeInstanceOf(ValidationError);
      await expect(saveBillingProfile(A.ctx, { ...profile, email: "sem-arroba" })).rejects.toBeInstanceOf(ValidationError);
      await expect(saveBillingProfile(A.ctx, { ...profile, name: "ab" })).rejects.toBeInstanceOf(ValidationError);
    });
    it("contratar exige dados de cobrança, preço do plano e 2FA", async () => {
      await expect(contractPlan(A.ctx, planPro.key)).rejects.toThrow(/dados de cobrança/);
      await saveBillingProfile(A.ctx, profile);
      expect((await sub(A.org.id)).billingDocument).toBe("52998224725");
      await expect(contractPlan(A.ctx, planFree.key)).rejects.toThrow(/ainda não tem preço/);
      await expect(contractPlan(A.ctx, "nao-existe")).rejects.toBeInstanceOf(ValidationError);
      const noMfa = await makeOrgWithOwner("bill-nomfa");
      await saveBillingProfile(noMfa.ctx, profile);
      await expect(contractPlan(noMfa.ctx, planPro.key)).rejects.toThrow(/duas etapas/);
      expect(fake.count("POST", /subscriptions/)).toBe(0);
    });
  });

  describe("contratar, trocar e cancelar", () => {
    let O: Awaited<ReturnType<typeof makeOrgWithOwner>>;
    beforeAll(async () => {
      O = await makeOrgWithOwner("bill-flow");
      await withMfa(O.owner.id, O.owner.email);
      await saveBillingProfile(O.ctx, profile);
    });

    it("cria cliente e assinatura mensal no provedor, com vencimento no fim do teste", async () => {
      const before = await sub(O.org.id);
      await db.subscription.update({ where: { organizationId: O.org.id }, data: { status: "TRIALING", trialEndsAt: new Date(Date.now() + 10 * DAY) } });
      await contractPlan(O.ctx, planPro.key);
      const cust = fake.requests.findLast((r) => r.method === "POST" && r.path === "/customers")!;
      expect(cust.token).toBe("chave-de-teste");
      expect(cust.body).toMatchObject({ name: profile.name, cpfCnpj: "52998224725", email: profile.email, externalReference: O.org.id });
      const created = fake.requests.findLast((r) => r.method === "POST" && r.path === "/subscriptions")!;
      expect(created.body).toMatchObject({ value: 99, billingType: "UNDEFINED", cycle: "MONTHLY", externalReference: O.org.id, nextDueDate: ymd(new Date(Date.now() + 10 * DAY)) });
      const s = await sub(O.org.id);
      expect(s.providerSubscriptionId).toMatch(/^sub_/);
      expect(s.billingProvider).toBe("asaas");
      expect(s.planId).toBe(planPro.id);
      expect(s.status).toBe("TRIALING"); // só vira ativa quando o pagamento for confirmado
      expect(before.providerSubscriptionId).toBeNull();
      const ov = await getBillingOverview(O.ctx);
      expect(ov.automatic).toBe(true);
      expect(ov.invoices).toHaveLength(1);
      expect(ov.invoices[0]!.invoiceUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\//);
    });

    it("trocar de plano só atualiza o valor das próximas faturas", async () => {
      const subs = fake.count("POST", /^\/subscriptions$/);
      await contractPlan(O.ctx, planMax.key);
      expect(fake.count("POST", /^\/subscriptions$/)).toBe(subs);
      const put = fake.requests.findLast((r) => r.method === "PUT" && r.path.startsWith("/subscriptions/"))!;
      expect(put.body).toMatchObject({ value: 199, updatePendingPayments: true });
      expect((await sub(O.org.id)).planId).toBe(planMax.id);
    });

    it("pagamento confirmado ativa por um mês; aviso repetido é ignorado; mentira no aviso não vale", async () => {
      const s = await sub(O.org.id);
      const p = fake.firstPaymentOf(s.providerSubscriptionId!);
      // o aviso diz "confirmado", mas o provedor diz que está pendente → nada muda
      await handleAsaasWebhook(TOKEN, evt("PAYMENT_CONFIRMED", p));
      expect((await sub(O.org.id)).status).toBe("TRIALING");
      // agora de verdade
      p.status = "RECEIVED";
      p.paymentDate = p.dueDate;
      const e = evt("PAYMENT_RECEIVED", p);
      // o aviso anterior (outro id) já gravou a chave; o novo id é processado
      expect((await handleAsaasWebhook(TOKEN, e)).status).toBe("ok");
      const a = await sub(O.org.id);
      expect(a.status).toBe("ACTIVE");
      expect(a.trialEndsAt).toBeNull();
      const [y, m, d] = p.dueDate.split("-").map(Number);
      const expected = new Date(Date.UTC(y!, m!, 1));
      expect(a.currentPeriodEnd!.getUTCFullYear()).toBe(expected.getUTCFullYear());
      expect(a.currentPeriodEnd!.getUTCMonth()).toBe(expected.getUTCMonth());
      expect(a.currentPeriodEnd!.getUTCDate()).toBeGreaterThanOrEqual(Math.min(d!, 28));
      expect((await handleAsaasWebhook(TOKEN, e)).status).toBe("duplicate");
      expect((await db.billingInvoice.findUniqueOrThrow({ where: { providerPaymentId: p.id } })).status).toBe("RECEIVED");
      expect(await db.auditLog.count({ where: { organizationId: O.org.id, action: "billing.payment_confirmed" } })).toBe(1);
    });

    it("próxima fatura vencida → em atraso; paga → volta; aviso antigo e tardio não derruba", async () => {
      const s = await sub(O.org.id);
      const old = fake.firstPaymentOf(s.providerSubscriptionId!);
      old.dueDate = ymd(new Date(Date.now() - 40 * DAY)); // a fatura anterior é de 40 dias atrás
      await db.billingInvoice.update({ where: { providerPaymentId: old.id }, data: { dueDate: new Date(`${old.dueDate}T00:00:00.000Z`) } });
      const next = fake.addPayment(s.providerSubscriptionId!, ymd(new Date(Date.now() - 2 * DAY)), "OVERDUE");
      await handleAsaasWebhook(TOKEN, evt("PAYMENT_OVERDUE", next));
      expect((await sub(O.org.id)).status).toBe("PAST_DUE");
      next.status = "CONFIRMED";
      next.paymentDate = ymd(new Date());
      await handleAsaasWebhook(TOKEN, evt("PAYMENT_CONFIRMED", next));
      expect((await sub(O.org.id)).status).toBe("ACTIVE");
      // evento antigo (fatura mais velha vira "vencida" tarde): a mais recente já está paga, então ignora
      old.status = "OVERDUE";
      await handleAsaasWebhook(TOKEN, evt("PAYMENT_OVERDUE", old));
      expect((await sub(O.org.id)).status).toBe("ACTIVE");
    });

    it("token errado é recusado; cliente desconhecido é ignorado; provedor fora do ar devolve erro e o aviso pode ser reenviado", async () => {
      await expect(handleAsaasWebhook("errado", { event: "PAYMENT_RECEIVED" })).rejects.toBeInstanceOf(WebhookAuthError);
      await expect(handleAsaasWebhook(null, { event: "PAYMENT_RECEIVED" })).rejects.toBeInstanceOf(WebhookAuthError);
      const s = await sub(O.org.id);
      const p = fake.addPayment(s.providerSubscriptionId!, ymd(new Date(Date.now() + 25 * DAY)), "PENDING");
      const e = evt("PAYMENT_CREATED", p);
      fake.state.down = true;
      await expect(handleAsaasWebhook(TOKEN, e)).rejects.toThrow();
      fake.state.down = false;
      expect((await handleAsaasWebhook(TOKEN, e)).status).toBe("ok"); // foi desfeito o registro: processa agora
      expect(await db.billingInvoice.count({ where: { providerPaymentId: p.id } })).toBe(1);
      expect((await handleAsaasWebhook(TOKEN, { id: "x1", event: "ALGO_NOVO", payment: { id: "pay_x" } })).status).toBe("ignored");
      const stranger = { id: "pay_estranho", customer: "cus_outro", subscription: "sub_outra", value: 1, status: "RECEIVED", dueDate: "2026-01-01", invoiceUrl: "https://x", billingType: "PIX" };
      fake.payments.set(stranger.id, stranger);
      expect((await handleAsaasWebhook(TOKEN, evt("PAYMENT_RECEIVED", stranger))).status).toBe("ok");
      expect(await db.billingInvoice.count({ where: { providerPaymentId: "pay_estranho" } })).toBe(0);
    });

    it("duas contratações simultâneas criam uma única assinatura", async () => {
      const R = await makeOrgWithOwner("bill-race");
      await withMfa(R.owner.id, R.owner.email);
      await saveBillingProfile(R.ctx, profile);
      const before = fake.count("POST", /^\/subscriptions$/);
      const r = await Promise.allSettled([contractPlan(R.ctx, planPro.key), contractPlan(R.ctx, planPro.key)]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(fake.count("POST", /^\/subscriptions$/) - before).toBe(1);
    });

    it("erro do provedor é explicado em português e libera nova tentativa", async () => {
      const R = await makeOrgWithOwner("bill-err");
      await withMfa(R.owner.id, R.owner.email);
      await saveBillingProfile(R.ctx, profile);
      fake.state.failNext = { match: /POST \/subscriptions/, status: 400, description: "CPF/CNPJ inválido para cobrança" };
      await expect(contractPlan(R.ctx, planPro.key)).rejects.toThrow(/CPF\/CNPJ inválido para cobrança/);
      expect((await sub(R.org.id)).providerSubscriptionId).toBeNull();
      await contractPlan(R.ctx, planPro.key);
      expect((await sub(R.org.id)).providerSubscriptionId).toMatch(/^sub_/);
      fake.state.failNext = { match: /PUT \/subscriptions/, status: 500, description: "x" };
      await expect(contractPlan(R.ctx, planMax.key)).rejects.toBeInstanceOf(Error);
    });

    it("cancelar pago: acesso até o fim do período, depois encerra pela rotina", async () => {
      await cancelSubscription(O.ctx);
      expect(fake.count("DELETE", /^\/subscriptions\//)).toBe(1);
      const s = await sub(O.org.id);
      expect(s.status).toBe("ACTIVE");
      expect(s.cancelRequestedAt).not.toBeNull();
      await expect(contractPlan(O.ctx, planPro.key)).rejects.toThrow(/cancelamento solicitado/);
      expect((await runBillingSweep()).canceledAtPeriodEnd).toBe(0);
      await db.subscription.update({ where: { organizationId: O.org.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
      expect((await runBillingSweep()).canceledAtPeriodEnd).toBeGreaterThanOrEqual(1);
      const end = await sub(O.org.id);
      expect(end.status).toBe("CANCELED");
      expect(end.providerSubscriptionId).toBeNull();
      expect(end.cancelRequestedAt).toBeNull();
    });

    it("cancelar durante o teste mantém o teste e libera contratar de novo; cancelar no painel do Asaas também é refletido", async () => {
      const T = await makeOrgWithOwner("bill-trial");
      await withMfa(T.owner.id, T.owner.email);
      await saveBillingProfile(T.ctx, profile);
      await contractPlan(T.ctx, planPro.key);
      await cancelSubscription(T.ctx);
      const s = await sub(T.org.id);
      expect(s.status).toBe("TRIALING");
      expect(s.providerSubscriptionId).toBeNull();
      await expect(cancelSubscription(T.ctx)).rejects.toThrow(/não tem cobrança automática/);
      // recontrata e cancela "por fora" (no painel do provedor) com o escritório ativo
      await contractPlan(T.ctx, planPro.key);
      const sid = (await sub(T.org.id)).providerSubscriptionId!;
      const p = fake.firstPaymentOf(sid);
      p.status = "RECEIVED"; p.paymentDate = p.dueDate;
      await handleAsaasWebhook(TOKEN, evt("PAYMENT_RECEIVED", p));
      expect((await sub(T.org.id)).status).toBe("ACTIVE");
      fake.subs.get(sid)!.deleted = true;
      fake.subs.get(sid)!.status = "INACTIVE";
      await handleAsaasWebhook(TOKEN, { id: `evt_${randomUUID()}`, event: "SUBSCRIPTION_DELETED", subscription: { id: sid } });
      expect((await sub(T.org.id)).cancelRequestedAt).not.toBeNull();
      expect((await sub(T.org.id)).status).toBe("ACTIVE");
    });

    it("atualizar situação reconcilia com o provedor (aviso perdido)", async () => {
      const R = await makeOrgWithOwner("bill-refresh");
      await withMfa(R.owner.id, R.owner.email);
      await saveBillingProfile(R.ctx, profile);
      await contractPlan(R.ctx, planPro.key);
      const sid = (await sub(R.org.id)).providerSubscriptionId!;
      const p = fake.firstPaymentOf(sid);
      p.status = "CONFIRMED"; p.paymentDate = p.dueDate; // pagou, mas nenhum aviso chegou
      await refreshBilling(R.ctx);
      expect((await sub(R.org.id)).status).toBe("ACTIVE");
      await expect(refreshBilling(O.ctx)).rejects.toThrow(/não tem cobrança automática/); // O já cancelou
    });

    it("cobrança de um escritório não vaza para outro", async () => {
      const ov = await getBillingOverview(A.ctx);
      expect(ov.invoices).toHaveLength(0);
      expect(ov.profile.email).toBe(profile.email);
    });
  });

  describe("administração de planos", () => {
    it("define preço e limites com validação e auditoria", async () => {
      await updatePlan(pc, planFree.key, { priceCents: 4990, maxUsers: 3, maxStorageMb: null, maxAiTokensMonth: 0 });
      const p = await db.plan.findUniqueOrThrow({ where: { key: planFree.key } });
      expect(p.priceCents).toBe(4990);
      expect(p.maxAiTokensMonth).toBe(0);
      expect((await listPlans(pc)).find((x) => x.key === planFree.key)!.priceCents).toBe(4990);
      await expect(updatePlan(pc, planFree.key, { priceCents: 5, maxUsers: null, maxStorageMb: null, maxAiTokensMonth: null })).rejects.toBeInstanceOf(ValidationError);
      await expect(updatePlan(pc, planFree.key, { priceCents: 100.5, maxUsers: null, maxStorageMb: null, maxAiTokensMonth: null })).rejects.toBeInstanceOf(ValidationError);
      await expect(updatePlan(pc, "nao-existe", { priceCents: null, maxUsers: null, maxStorageMb: null, maxAiTokensMonth: null })).rejects.toThrow(/não encontrado/);
      expect(await db.auditLog.count({ where: { action: "platform.plan_update", resourceId: planFree.id } })).toBe(1);
      const nobody = await makeUser("not-platform");
      await expect(updatePlan({ userId: nobody.id, meta: META }, planFree.key, { priceCents: null, maxUsers: null, maxStorageMb: null, maxAiTokensMonth: null })).rejects.toBeInstanceOf(Error);
    });
  });
});
