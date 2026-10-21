import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { registerPetitioningAdapter, type PetitioningAdapter } from "@/lib/petitioning/adapter";
import { totpCode, totpStep } from "@/lib/security/totp";
import { computeCnjCheck, formatCnj } from "@/lib/validation/br-documents";
import { createCase } from "@/server/services/case.service";
import { assertCredits, chargeCredits, creditBalance, getCreditsOverview, grantCredits, platformCreditsSnapshot, runCreditsCheck, setLowThreshold, setOrganizationCreditsEnabled } from "@/server/services/credit.service";
import { uploadDocument } from "@/server/services/document.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { approvePetition, createPetition, requestReview, submitPetition } from "@/server/services/petition.service";
import type { PlatformCtx } from "@/server/services/platform.service";
import { META, addMember, makeOrgWithOwner, makeUser } from "./helpers";

const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`);
const base = { legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const cnjDigits = { sequence: "0007654", year: "2025", segment: "8", court: "05", origin: "0001" };
const CNJ = formatCnj(`${cnjDigits.sequence}${computeCnjCheck(cnjDigits)}${cnjDigits.year}${cnjDigits.segment}${cnjDigits.court}${cnjDigits.origin}`);

describe("3.0-F10 — créditos e custos", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let pc: PlatformCtx;
  let outsider: PlatformCtx;
  let caseId: string;
  let submits = 0;
  const oldAdapter = process.env.PETITIONING_ADAPTER;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("l3f10-a");
    B = await makeOrgWithOwner("l3f10-b");
    lawyer = await addMember(A.org.id, "LAWYER", "l3f10-adv");
    const admin = await makeUser("l3f10-plat");
    const s = await startEnrollment(admin.id, admin.email);
    await confirmEnrollment(admin.id, totpCode(s.secret, totpStep()), META);
    await db.platformAdmin.create({ data: { userId: admin.id } });
    pc = { userId: admin.id, meta: META };
    outsider = { userId: lawyer.ctx.userId, meta: META };
    caseId = (await createCase(A.ctx, { ...base, number: CNJ, title: "Com número" })).id;
    registerPetitioningAdapter({ key: "f10-real", label: "Real (teste)", isDemo: false, async submit() { submits++; return { protocol: `P-${submits}`, receipt: "ok" }; } } satisfies PetitioningAdapter);
  });
  afterAll(() => {
    if (oldAdapter === undefined) delete process.env.PETITIONING_ADAPTER; else process.env.PETITIONING_ADAPTER = oldAdapter;
  });

  async function approved(title: string) {
    const doc = await uploadDocument(A.ctx, { caseId }, { name: `${title}.pdf`, buffer: pdf(`${title}-${Math.random()}`) });
    const p = await createPetition(lawyer.ctx, { caseId, documentId: doc.id, title });
    await requestReview(lawyer.ctx, p.id);
    await approvePetition(A.ctx, p.id);
    return p;
  }

  it("só a plataforma liga e concede; valida quantidade e validade; nasce desligado", async () => {
    const o = await db.organization.findUniqueOrThrow({ where: { id: A.org.id } });
    expect(o.creditsEnabled).toBe(false);
    await expect(grantCredits(outsider, A.org.id, { amount: 10 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setOrganizationCreditsEnabled(outsider, A.org.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    for (const amount of [0, -3, 1.5, 2_000_000]) await expect(grantCredits(pc, A.org.id, { amount })).rejects.toBeInstanceOf(ValidationError);
    await expect(grantCredits(pc, A.org.id, { amount: 5, expiresInDays: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(grantCredits(pc, "00000000-0000-4000-8000-000000000000", { amount: 5 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCreditsOverview(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError); // advogado não administra cobrança
  });

  it("desligado: nada cobra nem trava", async () => {
    await assertCredits(A.org.id, "petition.submit");
    expect(await chargeCredits(A.org.id, "petition.submit", { type: "petition", id: "x1" })).toEqual({ charged: false, reason: "disabled" });
    expect(await db.creditUsage.count({ where: { organizationId: A.org.id } })).toBe(0);
  });

  it("ligado e sem saldo recusa; com saldo, consome primeiro o lote que vence antes; mesmo fato não cobra duas vezes", async () => {
    await setOrganizationCreditsEnabled(pc, A.org.id, true);
    await expect(assertCredits(A.org.id, "petition.submit")).rejects.toBeInstanceOf(ConflictError);
    const soon = await grantCredits(pc, A.org.id, { amount: 7, expiresInDays: 5, note: "curto" });
    const open = await grantCredits(pc, A.org.id, { amount: 10 });
    expect(await creditBalance(A.org.id)).toBe(17);
    await assertCredits(A.org.id, "petition.submit");
    expect(await chargeCredits(A.org.id, "petition.submit", { type: "petition", id: "r1", userId: lawyer.ctx.userId })).toEqual({ charged: true });
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: soon } })).remaining).toBe(2);
    expect(await chargeCredits(A.org.id, "petition.submit", { type: "petition", id: "r1" })).toEqual({ charged: false, reason: "duplicate" });
    expect(await creditBalance(A.org.id)).toBe(12);
    await chargeCredits(A.org.id, "petition.submit", { type: "petition", id: "r2" });
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: soon } })).remaining).toBe(0);
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: open } })).remaining).toBe(7);
    const o = await getCreditsOverview(A.ctx);
    expect(o.balance).toBe(7);
    expect(o.usage).toHaveLength(2);
    expect(o.grants.map((g) => g.id)).toEqual([open]); // lote zerado some
  });

  it("créditos vencidos não contam; cobranças simultâneas nunca estouram o saldo", async () => {
    await db.creditGrant.create({ data: { organizationId: A.org.id, amount: 50, remaining: 50, expiresAt: new Date(Date.now() - 1000) } });
    expect(await creditBalance(A.org.id)).toBe(7); // o vencido não entra
    const res = await Promise.all(["c1", "c2", "c3", "c4"].map((id) => chargeCredits(A.org.id, "petition.submit", { type: "petition", id })));
    expect(res.filter((r) => r.charged)).toHaveLength(1); // 7 créditos = uma cobrança de 5
    expect(await creditBalance(A.org.id)).toBe(2);
    expect(await db.creditUsage.count({ where: { organizationId: A.org.id } })).toBe(3);
  });

  it("protocolo REAL cobra depois de concluir; sem saldo é barrado ANTES de enviar; demonstração nunca cobra", async () => {
    await grantCredits(pc, A.org.id, { amount: 8 }); // saldo 10
    process.env.PETITIONING_ADAPTER = "f10-real";
    const p1 = await approved("Real 1");
    const before = submits;
    await submitPetition(A.ctx, p1.id, { confirmCase: CNJ });
    expect(submits).toBe(before + 1);
    expect(await creditBalance(A.org.id)).toBe(5);
    expect(await db.creditUsage.count({ where: { organizationId: A.org.id, refId: p1.id } })).toBe(1);
    const p2 = await approved("Real 2");
    await submitPetition(A.ctx, p2.id, { confirmCase: CNJ });
    expect(await creditBalance(A.org.id)).toBe(0);
    const p3 = await approved("Real 3");
    const s0 = submits;
    await expect(submitPetition(A.ctx, p3.id, { confirmCase: CNJ })).rejects.toBeInstanceOf(ConflictError);
    expect(submits).toBe(s0); // o tribunal nunca foi acionado
    expect((await db.petitionFiling.findUniqueOrThrow({ where: { id: p3.id } })).status).toBe("APPROVED"); // continua aprovada, pode tentar depois
    delete process.env.PETITIONING_ADAPTER; // demo
    const p4 = await approved("Demo");
    await submitPetition(A.ctx, p4.id);
    expect(await creditBalance(A.org.id)).toBe(0);
    expect(await db.creditUsage.count({ where: { organizationId: A.org.id, refId: p4.id } })).toBe(0);
  });

  it("avisos: saldo baixo (uma vez por lote) e lote perto de vencer; limite inválido recusado; escritório B isolado", async () => {
    await expect(setLowThreshold(A.ctx, -1)).rejects.toBeInstanceOf(ValidationError);
    await expect(setLowThreshold(lawyer.ctx, 5)).rejects.toBeInstanceOf(ForbiddenError);
    await grantCredits(pc, A.org.id, { amount: 12, expiresInDays: 3 });
    await setLowThreshold(A.ctx, 20); // saldo 12 ≤ 20
    const n1 = await db.notification.count({ where: { organizationId: A.org.id, kind: "CREDITS_LOW" } });
    expect(n1).toBeGreaterThan(0);
    await runCreditsCheck(A.org.id);
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "CREDITS_LOW" } })).toBe(n1); // sem repetir
    expect(await db.notification.count({ where: { organizationId: A.org.id, kind: "CREDITS_EXPIRING" } })).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { organizationId: B.org.id, kind: { in: ["CREDITS_LOW", "CREDITS_EXPIRING"] } } })).toBe(0);
    expect(await creditBalance(B.org.id)).toBe(0);
    await expect(getCreditsOverview(B.ctx)).resolves.toMatchObject({ enabled: false, balance: 0 });
    const snap = await platformCreditsSnapshot(pc, [A.org.id, B.org.id]);
    expect(snap.get(A.org.id)).toEqual({ enabled: true, balance: 12 });
    expect(snap.get(B.org.id)).toEqual({ enabled: false, balance: 0 });
    await expect(platformCreditsSnapshot(outsider, [A.org.id])).rejects.toBeInstanceOf(ForbiddenError);
  });
});
