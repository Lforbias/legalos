import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { addDocumentVersion, deleteDocument, getDocumentForDownload, listRepository, uploadDocument } from "@/server/services/document.service";
import { createInvitation } from "@/server/services/invitation.service";
import { assertAiAllowed, effectiveAiLimit, getEntitlements, getUsage, resolveEntitlements } from "@/server/services/plan.service";
import { listOrganizations, listPlans, setOrganizationSubscription, type PlatformCtx } from "@/server/services/platform.service";
import { META, makeOrgWithOwner, makeUser, roleByKey } from "./helpers";

const pdf = (tag: string, kb = 0) => Buffer.from(`%PDF-1.4\n% ${tag}\n${"x".repeat(kb * 1024)}\n%%EOF`);
const DAY = 86_400_000;

describe("planos, limites e assinatura (9d)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let pc: PlatformCtx;
  let small: { id: string; key: string };
  let noAi: { id: string; key: string };

  const setSub = (orgId: string, data: Record<string, unknown>) => db.subscription.update({ where: { organizationId: orgId }, data });

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("plan-A");
    B = await makeOrgWithOwner("plan-B");
    const admin = await makeUser("plan-admin");
    const s = await startEnrollment(admin.id, admin.email);
    await confirmEnrollment(admin.id, totpCode(s.secret, totpStep()), META);
    await db.platformAdmin.create({ data: { userId: admin.id } });
    pc = { userId: admin.id, meta: META };
    const suffix = randomUUID().slice(0, 6);
    small = await db.plan.create({ data: { key: `mini-${suffix}`, name: "Mini", maxUsers: 2, maxStorageMb: 1, maxAiTokensMonth: 1000, features: [], isPublic: false } });
    noAi = await db.plan.create({ data: { key: `semia-${suffix}`, name: "Sem IA", maxUsers: null, maxStorageMb: null, maxAiTokensMonth: 0, features: [], isPublic: false } });
  });

  describe("interpretação da assinatura", () => {
    const plan = { key: "p", name: "P", maxUsers: 5, maxStorageMb: 10, maxAiTokensMonth: 100, features: ["x"] };
    const now = new Date("2026-10-20T12:00:00Z");
    it("estados: em dia, teste terminando, teste encerrado, atraso e cancelada", () => {
      expect(resolveEntitlements(null).state).toBe("none");
      expect(resolveEntitlements(null).expansionBlocked).toBe(false);
      expect(resolveEntitlements({ status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null, plan }, now).state).toBe("ok");
      const ending = resolveEntitlements({ status: "TRIALING", trialEndsAt: new Date(now.getTime() + 2 * DAY), currentPeriodEnd: null, plan }, now);
      expect(ending.state).toBe("trial_ending");
      expect(ending.expansionBlocked).toBe(false);
      expect(ending.trialDaysLeft).toBe(2);
      const expired = resolveEntitlements({ status: "TRIALING", trialEndsAt: new Date(now.getTime() - 1000), currentPeriodEnd: null, plan }, now);
      expect(expired.state).toBe("trial_expired");
      expect(expired.expansionBlocked).toBe(true);
      expect(resolveEntitlements({ status: "TRIALING", trialEndsAt: new Date(now.getTime() + 10 * DAY), currentPeriodEnd: null, plan }, now).state).toBe("ok");
      expect(resolveEntitlements({ status: "PAST_DUE", trialEndsAt: null, currentPeriodEnd: null, plan }, now)).toMatchObject({ state: "past_due", expansionBlocked: false });
      expect(resolveEntitlements({ status: "CANCELED", trialEndsAt: null, currentPeriodEnd: null, plan }, now)).toMatchObject({ state: "canceled", expansionBlocked: true });
    });
    it("limite de IA é o menor entre plano e sistema", () => {
      expect(effectiveAiLimit(null, 500)).toBe(500);
      expect(effectiveAiLimit(100, 500)).toBe(100);
      expect(effectiveAiLimit(900, 500)).toBe(500);
    });
  });

  describe("armazenamento", () => {
    let caseId: string;
    beforeAll(async () => {
      caseId = (await db.case.create({ data: { organizationId: A.org.id, title: "Cota" } })).id;
      await setSub(A.org.id, { planId: small.id, status: "ACTIVE", trialEndsAt: null });
    });

    it("sobe até a cota do plano, recusa o que passa dela com mensagem clara, e excluir libera espaço", async () => {
      const ok = await uploadDocument(A.ctx, { caseId }, { name: "a.pdf", buffer: pdf("a", 600) });
      const u1 = await getUsage(A.org.id);
      expect(u1.storageBytes).toBeGreaterThan(600 * 1024);
      await expect(uploadDocument(A.ctx, { caseId }, { name: "b.pdf", buffer: pdf("b", 600) })).rejects.toThrow(/1 MB de armazenamento/);
      await expect(addDocumentVersion(A.ctx, ok.id, { name: "a2.pdf", buffer: pdf("a2", 600) })).rejects.toBeInstanceOf(ConflictError);
      await expect(uploadDocument(A.ctx, { caseId }, { name: "c.pdf", buffer: pdf("c", 1) })).resolves.toBeTruthy();
      await deleteDocument(A.ctx, ok.id);
      await expect(uploadDocument(A.ctx, { caseId }, { name: "d.pdf", buffer: pdf("d", 600) })).resolves.toBeTruthy();
    });

    it("o uso conta só o próprio escritório", async () => {
      expect((await getUsage(B.org.id)).storageBytes).toBe(0);
    });
  });

  describe("teste encerrado ou cancelada: só o que aumenta uso é pausado", () => {
    let caseId: string;
    let docId: string;
    beforeAll(async () => {
      caseId = (await db.case.create({ data: { organizationId: B.org.id, title: "Pausa" } })).id;
      docId = (await uploadDocument(B.ctx, { caseId }, { name: "antes.pdf", buffer: pdf("antes") })).id;
      await setSub(B.org.id, { status: "TRIALING", trialEndsAt: new Date(Date.now() - DAY) });
    });

    it("recusa upload, nova versão, convite e IA, mas consulta e baixa normalmente", async () => {
      await expect(uploadDocument(B.ctx, { caseId }, { name: "novo.pdf", buffer: pdf("novo") })).rejects.toThrow(/período de teste/);
      await expect(addDocumentVersion(B.ctx, docId, { name: "v2.pdf", buffer: pdf("v2") })).rejects.toBeInstanceOf(ConflictError);
      const role = await roleByKey(B.org.id, "LAWYER");
      await expect(createInvitation(B.ctx, { email: `x-${randomUUID().slice(0, 6)}@example.test`, roleId: role.id })).rejects.toBeInstanceOf(ConflictError);
      await expect(assertAiAllowed(B.org.id, 500_000)).rejects.toBeInstanceOf(ConflictError);
      expect((await listRepository(B.ctx)).items.length).toBeGreaterThan(0);
      expect((await getDocumentForDownload(B.ctx, docId)).name).toBe("antes.pdf");
    });

    it("assinatura cancelada também pausa; ativar de novo libera", async () => {
      await setSub(B.org.id, { status: "CANCELED", trialEndsAt: null });
      await expect(uploadDocument(B.ctx, { caseId }, { name: "n2.pdf", buffer: pdf("n2") })).rejects.toThrow(/cancelada/);
      await setSub(B.org.id, { status: "ACTIVE" });
      await expect(uploadDocument(B.ctx, { caseId }, { name: "n3.pdf", buffer: pdf("n3") })).resolves.toBeTruthy();
    });

    it("pagamento em atraso apenas avisa (não bloqueia)", async () => {
      await setSub(B.org.id, { status: "PAST_DUE" });
      expect((await getEntitlements(B.org.id)).expansionBlocked).toBe(false);
      await expect(uploadDocument(B.ctx, { caseId }, { name: "n4.pdf", buffer: pdf("n4") })).resolves.toBeTruthy();
    });
  });

  describe("IA e usuários por plano", () => {
    it("plano sem IA recusa; plano com limite pequeno recusa ao estourar", async () => {
      const C = await makeOrgWithOwner("plan-C");
      await setSub(C.org.id, { planId: noAi.id, status: "ACTIVE", trialEndsAt: null });
      await expect(assertAiAllowed(C.org.id, 500_000)).rejects.toThrow(/não inclui o assistente de IA/);
      await setSub(C.org.id, { planId: small.id });
      await expect(assertAiAllowed(C.org.id, 500_000)).resolves.toBeUndefined();
      await db.aiUsage.create({ data: { organizationId: C.org.id, userId: C.ctx.userId, feature: "case-ask", provider: "test", model: "m", inputTokens: 900, outputTokens: 200 } });
      await expect(assertAiAllowed(C.org.id, 500_000)).rejects.toThrow(/limite mensal/);
      await setSub(C.org.id, { planId: noAi.id });
      await db.aiUsage.deleteMany({ where: { organizationId: C.org.id } });
    });

    it("limite de usuários do plano continua valendo", async () => {
      const D = await makeOrgWithOwner("plan-D");
      await setSub(D.org.id, { planId: small.id, status: "ACTIVE", trialEndsAt: null });
      const role = await roleByKey(D.org.id, "LAWYER");
      await createInvitation(D.ctx, { email: `d1-${randomUUID().slice(0, 6)}@example.test`, roleId: role.id });
      await expect(createInvitation(D.ctx, { email: `d2-${randomUUID().slice(0, 6)}@example.test`, roleId: role.id })).rejects.toThrow(/permite até 2 usuários/);
    });
  });

  describe("administração da plataforma", () => {
    it("só administrador altera; registra na auditoria; plano e prazos mudam de fato", async () => {
      const stranger = await makeUser("plan-stranger");
      await expect(setOrganizationSubscription({ userId: stranger.id, meta: META }, A.org.id, { planKey: small.key, status: "ACTIVE" })).rejects.toBeInstanceOf(ForbiddenError);
      const pro = (await listPlans(pc)).find((p) => p.key === "profissional");
      expect(pro).toBeTruthy();
      await setOrganizationSubscription(pc, A.org.id, { planKey: "profissional", status: "TRIALING", trialDays: 30, note: "teste estendido" });
      const e = await getEntitlements(A.org.id);
      expect(e.planKey).toBe("profissional");
      expect(e.status).toBe("TRIALING");
      expect(e.trialDaysLeft).toBeGreaterThanOrEqual(29);
      await setOrganizationSubscription(pc, A.org.id, { planKey: "profissional", status: "ACTIVE", periodDays: 30 });
      const e2 = await getEntitlements(A.org.id);
      expect(e2.state).toBe("ok");
      expect(e2.currentPeriodEnd).not.toBeNull();
      expect(e2.trialEndsAt).toBeNull();
      const log = await db.auditLog.findMany({ where: { organizationId: A.org.id, action: "platform.subscription_update" } });
      expect(log.length).toBe(2);
      const row = (await listOrganizations(pc, { q: "plan-A" })).items.find((o) => o.id === A.org.id);
      expect(row?.plan?.key).toBe("profissional");
      expect(row?.plan?.status).toBe("ACTIVE");
    });

    it("recusa plano inexistente, dias inválidos e escritório inexistente", async () => {
      await expect(setOrganizationSubscription(pc, A.org.id, { planKey: "nao-existe", status: "ACTIVE" })).rejects.toBeInstanceOf(ValidationError);
      await expect(setOrganizationSubscription(pc, A.org.id, { planKey: "profissional", status: "TRIALING", trialDays: -1 })).rejects.toBeInstanceOf(ValidationError);
      await expect(setOrganizationSubscription(pc, randomUUID(), { planKey: "profissional", status: "ACTIVE" })).rejects.toThrow(/não encontrado/);
    });
  });
});
