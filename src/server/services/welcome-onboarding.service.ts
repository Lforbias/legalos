import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { z } from "zod";
import { welcomeDraftSchema, welcomeOfficeDraftSchema, welcomeProfileSchema, type WelcomeProfile } from "@/modules/welcome/schemas";
import { assertPlatform, type PlatformCtx } from "@/server/services/platform.service";

const activationStateSchema = z.object({
  completed: z.array(z.string()).max(12).default([]),
  completedAt: z.record(z.string(), z.string()).default({}),
  dismissed: z.boolean().default(false),
});

export async function getWelcomeProgress(userId: string): Promise<{ currentStep: number; data: WelcomeProfile; office: ReturnType<typeof welcomeOfficeDraftSchema.parse>; activationPath: "TRIAL" | "GIFT" | "SUBSCRIPTION"; planKey: string }> {
  const record = await db.welcomeOnboarding.findUnique({ where: { userId }, select: { currentStep: true, data: true, completedAt: true } });
  const structured = welcomeDraftSchema.shape.data.safeParse(record?.data ?? {});
  const legacyProfile = welcomeProfileSchema.safeParse(record?.data ?? {});
  return {
    currentStep: record?.completedAt ? 3 : Math.max(1, Math.min(3, record?.currentStep ?? 1)),
    data: structured.success ? structured.data.profile : legacyProfile.success ? legacyProfile.data : welcomeProfileSchema.parse({}),
    office: structured.success ? structured.data.office : welcomeOfficeDraftSchema.parse({}),
    activationPath: structured.success ? structured.data.activationPath ?? "TRIAL" : "TRIAL",
    planKey: structured.success ? structured.data.planKey ?? "simples" : "simples",
  };
}

export async function getWelcomeActivationState(userId: string, organizationId: string) {
  const record = await db.welcomeOnboarding.findFirst({ where: { userId, completedOrganizationId: organizationId }, select: { data: true } });
  if (!record) return { completed: [] as string[], completedAt: {} as Record<string, string>, dismissed: false, available: false, showTeam: false };
  const raw = record?.data && typeof record.data === "object" && !Array.isArray(record.data) ? (record.data as Record<string, unknown>).activationChecklist : undefined;
  const data = record?.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : {};
  const profile = data.profile && typeof data.profile === "object" ? data.profile as Record<string, unknown> : {};
  const showTeam = profile.professionalType === "LAW_FIRM" || (typeof profile.teamSize === "string" && profile.teamSize !== "SOLO");
  const [clients, cases, documents, internalMembers, connectedMessaging] = await Promise.all([
    db.client.count({ where: { organizationId, deletedAt: null } }),
    db.case.count({ where: { organizationId, deletedAt: null } }),
    db.document.count({ where: { organizationId, deletedAt: null } }),
    db.membership.count({ where: { organizationId, status: "ACTIVE", role: { key: { not: "CLIENT" } } } }),
    db.whatsappAccount.count({ where: { organizationId, enabled: true, OR: [{ qrState: "CONNECTED" }, { phoneNumberId: { not: null }, tokenEnc: { not: null } }] } }),
  ]);
  const state = activationStateSchema.parse(raw ?? {});
  const facts: Record<string, boolean> = { client: clients > 0, case: cases > 0, documents: documents > 0, team: showTeam && internalMembers > 1, messaging: connectedMessaging > 0 };
  const completed = new Set(state.completed);
  const completedAt = { ...state.completedAt };
  let changed = false;
  for (const [id, exists] of Object.entries(facts)) {
    if (exists && !completed.has(id)) {
      completed.add(id);
      completedAt[id] = new Date().toISOString();
      changed = true;
    }
  }
  const next = { ...state, completed: [...completed], completedAt };
  if (changed) {
    const original = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : {};
    await db.welcomeOnboarding.update({ where: { userId }, data: { data: { ...original, activationChecklist: next } as Prisma.InputJsonValue } });
  }
  return { ...next, available: true, showTeam };
}

export async function dismissWelcomeActivationChecklist(userId: string, organizationId: string) {
  await db.$transaction(async (tx) => {
    const record = await tx.welcomeOnboarding.findFirst({ where: { userId, completedOrganizationId: organizationId }, select: { userId: true, data: true } });
    if (!record) return;
    const raw = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? (record.data as Record<string, unknown>).activationChecklist : undefined;
    const state = activationStateSchema.parse(raw ?? {});
    const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : {};
    await tx.welcomeOnboarding.update({ where: { userId: record.userId }, data: { data: { ...data, activationChecklist: { ...state, dismissed: true } } as Prisma.InputJsonValue } });
  });
}

export async function getWelcomeFunnelMetrics(pc: PlatformCtx) {
  await assertPlatform(pc);
  const records = await db.welcomeOnboarding.findMany({ select: { currentStep: true, data: true, completedAt: true, completedOrganizationId: true, updatedAt: true } });
  const staleBefore = new Date(Date.now() - 7 * 86_400_000);
  const unfinished = records.filter((record) => !record.completedAt && record.updatedAt <= staleBefore);
  const planSelections: Record<string, number> = {};
  const activationPaths: Record<string, number> = { TRIAL: 0, GIFT: 0, SUBSCRIPTION: 0 };
  const activation: Record<string, number> = { client: 0, case: 0, team: 0, documents: 0, messaging: 0 };
  for (const record of records) {
    const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : {};
    const path = typeof data.activationPath === "string" && data.activationPath in activationPaths ? data.activationPath : "TRIAL";
    activationPaths[path] = (activationPaths[path] ?? 0) + 1;
    if (path === "SUBSCRIPTION") {
      const selected = typeof data.planKey === "string" ? data.planKey : "unspecified";
      planSelections[selected] = (planSelections[selected] ?? 0) + 1;
    }
    const checklist = data.activationChecklist && typeof data.activationChecklist === "object" ? data.activationChecklist as Record<string, unknown> : {};
    const completedAt = checklist.completedAt && typeof checklist.completedAt === "object" ? checklist.completedAt as Record<string, unknown> : {};
    for (const key of Object.keys(activation)) if (typeof completedAt[key] === "string") activation[key] = (activation[key] ?? 0) + 1;
  }
  const organizationIds = records.flatMap((record) => record.completedOrganizationId ? [record.completedOrganizationId] : []);
  let redeemedGiftCodes = 0;
  let paidOrganizations: Array<{ organizationId: string }> = [];
  if (organizationIds.length) {
    [redeemedGiftCodes, paidOrganizations] = await Promise.all([
      db.giftCodeRedemption.count({ where: { organizationId: { in: organizationIds }, status: "APPLIED" } }),
      db.billingInvoice.groupBy({ by: ["organizationId"], where: { organizationId: { in: organizationIds }, status: { in: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"] } } }),
    ]);
  }
  return {
    started: records.length,
    completed: records.filter((record) => record.completedAt).length,
    staleByStep: [1, 2, 3].map((step) => ({ step, count: unfinished.filter((record) => Math.min(3, Math.max(1, record.currentStep)) === step).length })),
    planSelections,
    activationPaths,
    redeemedGiftCodes,
    paidOrganizations: paidOrganizations.length,
    firstActions: activation,
  };
}
