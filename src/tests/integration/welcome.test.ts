import { beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GiftCodeBenefitType } from "@prisma/client";
import { db } from "@/lib/db/client";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { createOrganization } from "@/server/services/organization.service";
import { createGiftCode, previewGiftCode, reserveGiftCode } from "@/server/services/gift-code.service";
import { getWelcomeActivationState } from "@/server/services/welcome-onboarding.service";
import { acceptInvitation, createInvitation } from "@/server/services/invitation.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import { totpCode, totpStep } from "@/lib/security/totp";
import { makeUser, META, roleByKey } from "./helpers";

describe("LegalOS Welcome — piloto local", () => {
  let platform: { userId: string; meta: typeof META };

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const admin = await makeUser("welcome-platform-admin");
    const enrollment = await startEnrollment(admin.id, admin.email);
    await confirmEnrollment(admin.id, totpCode(enrollment.secret, totpStep()), META);
    await db.platformAdmin.create({ data: { userId: admin.id } });
    platform = { userId: admin.id, meta: META };
  });

  it("reserva e aplica presente sem cobrança, salva OAB e detecta primeiras ações reais", async () => {
    const owner = await makeUser("welcome-gift-owner");
    const gift = await createGiftCode(platform, { label: "Piloto Welcome", benefitType: GiftCodeBenefitType.PLAN_ACCESS, planKey: "simples", accessDays: 21, usageLimit: 1, stackable: false });
    const preview = await previewGiftCode(owner.id, gift.code);
    expect(preview).toMatchObject({ planName: "Simples", accessDays: 21, alreadyReserved: false });
    const reserved = await reserveGiftCode(owner.id, gift.code);
    expect(reserved.alreadyReserved).toBe(true);

    const organization = await createOrganization(owner.id, { name: "Escritório piloto presente", timezone: "America/Sao_Paulo" }, META, {
      welcomeOnboarding: {
        profile: { professionalType: "LAW_FIRM", teamSize: "2_5", oabNumber: "123456", oabUf: "SP" },
        office: { name: "Escritório piloto presente", legalName: "", document: "", timezone: "America/Sao_Paulo" },
        activationPath: "GIFT", planKey: null, activationChecklist: { completed: [], completedAt: {}, dismissed: false },
      },
      requireGift: true,
      professionalIdentity: { name: owner.name, oabNumber: "123456", oabUf: "SP", notifyEmail: owner.email },
    });

    const subscription = await db.subscription.findUniqueOrThrow({ where: { organizationId: organization.id }, include: { plan: true } });
    expect(subscription.plan.key).toBe("simples");
    expect(subscription.status).toBe("TRIALING");
    expect(subscription.providerSubscriptionId).toBeNull();
    expect(subscription.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 20 * 86_400_000);
    expect(await db.professionalIdentity.findFirst({ where: { organizationId: organization.id, oabNumber: "123456", oabUf: "SP", userId: owner.id } })).not.toBeNull();
    expect(await db.giftCodeRedemption.findUniqueOrThrow({ where: { giftCodeId_userId: { giftCodeId: gift.id, userId: owner.id } } })).toMatchObject({ status: "APPLIED", organizationId: organization.id });

    const otherOwner = await makeUser("welcome-trial-owner");
    const otherOrganization = await createOrganization(otherOwner.id, { name: "Escritório piloto avaliação", timezone: "America/Sao_Paulo" }, META);
    const freeTrial = await db.subscription.findUniqueOrThrow({ where: { organizationId: otherOrganization.id }, include: { plan: true } });
    expect(freeTrial.plan.key).toBe("welcome-trial");
    expect(freeTrial.status).toBe("TRIALING");
    expect(freeTrial.providerSubscriptionId).toBeNull();
    const initialChecklist = await getWelcomeActivationState(owner.id, organization.id);
    expect(initialChecklist).toMatchObject({ available: true, showTeam: true, completed: [] });
    const client = await db.client.create({ data: { organizationId: organization.id, type: "PERSON", name: "Cliente piloto", tags: [] } });
    expect(client.organizationId).toBe(organization.id);
    const invitee = await makeUser("welcome-invitee");
    const ownerContext = await resolveTenantContext(owner.id, organization.id, META);
    const role = await roleByKey(organization.id, "ASSISTANT");
    const invitation = await createInvitation(ownerContext!, { email: invitee.email, roleId: role.id });
    const token = new URL(invitation.link).searchParams.get("token");
    expect(token).toBeTruthy();
    await acceptInvitation(invitee.id, token!, META);
    const refreshedChecklist = await getWelcomeActivationState(owner.id, organization.id);
    expect(refreshedChecklist.completed).toContain("client");
    expect(refreshedChecklist.completed).toContain("team");
    expect(refreshedChecklist.completedAt.client).toBeTruthy();
    expect(refreshedChecklist.completedAt.team).toBeTruthy();
    expect(await db.client.count({ where: { organizationId: otherOrganization.id } })).toBe(0);
  });

  it("reserva vencida não trava a avaliação gratuita e não é aplicada; caminho de presente exige reserva vigente", async () => {
    const owner = await makeUser("welcome-expired-gift");
    const gift = await createGiftCode(platform, { label: "Presente vencido", benefitType: GiftCodeBenefitType.TRIAL_EXTENSION, accessDays: 30, usageLimit: 5, stackable: false });
    await reserveGiftCode(owner.id, gift.code);
    await db.giftCodeRedemption.updateMany({ where: { giftCodeId: gift.id, userId: owner.id }, data: { reservationExpiresAt: new Date(Date.now() - 60_000) } });
    const welcome = (activationPath: "TRIAL" | "GIFT") => ({
      profile: { professionalType: "SOLO" }, office: { name: "Escritório reserva vencida", legalName: "", document: "", timezone: "America/Sao_Paulo" },
      activationPath, planKey: null, activationChecklist: { completed: [], completedAt: {}, dismissed: false },
    });

    await expect(createOrganization(owner.id, { name: "Escritório reserva vencida", timezone: "America/Sao_Paulo" }, META, { welcomeOnboarding: welcome("GIFT"), requireGift: true })).rejects.toThrow(/reserva do código expirou/);
    expect(await db.membership.count({ where: { userId: owner.id } })).toBe(0);

    const organization = await createOrganization(owner.id, { name: "Escritório reserva vencida", timezone: "America/Sao_Paulo" }, META, { welcomeOnboarding: welcome("TRIAL") });
    const subscription = await db.subscription.findUniqueOrThrow({ where: { organizationId: organization.id }, include: { plan: true } });
    expect(subscription).toMatchObject({ status: "TRIALING", providerSubscriptionId: null, billingProvider: null });
    expect(subscription.plan.key).toBe("welcome-trial");
    expect(subscription.trialEndsAt!.getTime()).toBeLessThan(Date.now() + 15 * 86_400_000);
    expect(await db.giftCodeRedemption.findUniqueOrThrow({ where: { giftCodeId_userId: { giftCodeId: gift.id, userId: owner.id } } })).toMatchObject({ status: "RESERVED", organizationId: null, appliedAt: null });
    expect(await db.billingInvoice.count({ where: { organizationId: organization.id } })).toBe(0);
  });

  it("caminho de avaliação com reserva vigente é recusado no servidor, sem criar escritório", async () => {
    const owner = await makeUser("welcome-trial-with-reservation");
    const gift = await createGiftCode(platform, { label: "Presente vigente", benefitType: GiftCodeBenefitType.TRIAL_EXTENSION, accessDays: 10, usageLimit: 5, stackable: false });
    await reserveGiftCode(owner.id, gift.code);
    await expect(createOrganization(owner.id, { name: "Escritório com reserva", timezone: "America/Sao_Paulo" }, META, {
      welcomeOnboarding: { profile: { professionalType: "SOLO" }, office: { name: "Escritório com reserva", legalName: "", document: "", timezone: "America/Sao_Paulo" }, activationPath: "TRIAL", planKey: null, activationChecklist: { completed: [], completedAt: {}, dismissed: false } },
    })).rejects.toThrow(/Remova a reserva/);
    expect(await db.membership.count({ where: { userId: owner.id } })).toBe(0);
  });
});
