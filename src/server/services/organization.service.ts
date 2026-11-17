import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { SYSTEM_ROLES } from "@/lib/permissions/roles";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { slugify } from "@/lib/validation/slug";
import { assertCan, type RequestMeta, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { mfaStatus } from "./mfa.service";

const TRIAL_DAYS = 14;
const TRIAL_PLAN_KEY = "welcome-trial";
const MAX_ORGS_PER_USER = 10;

/**
 * Cria escritório + perfis de sistema + vínculo do criador como Proprietário + assinatura em trial,
 * tudo em uma única transação. O trial NÃO envolve cobrança (não há provedor integrado).
 */
export async function createOrganization(
  userId: string,
  input: { name: string; timezone: string; legalName?: string | null; document?: string | null },
  meta: RequestMeta,
  options?: { welcomeOnboarding?: Prisma.InputJsonValue; professionalIdentity?: { name: string; oabNumber: string; oabUf: string; notifyEmail?: string | null } },
) {
  if (options?.welcomeOnboarding) {
    const previous = await db.welcomeOnboarding.findUnique({ where: { userId }, select: { completedOrganizationId: true } });
    if (previous?.completedOrganizationId) {
      const membership = await db.membership.findFirst({
        where: { userId, organizationId: previous.completedOrganizationId, status: "ACTIVE" },
        select: { organization: true },
      });
      if (membership) return membership.organization;
    }
  }
  const owned = await db.membership.count({ where: { userId, role: { key: "OWNER" } } });
  if (owned >= MAX_ORGS_PER_USER) throw new ConflictError("Limite de escritórios por usuário atingido.");

  const plan = await db.plan.findUnique({ where: { key: TRIAL_PLAN_KEY } });
  if (!plan) throw new Error(`Plano ${TRIAL_PLAN_KEY} não encontrado. Execute as migrations.`);

  const base = slugify(input.name) || "escritorio";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      return await db.$transaction(async (tx) => {
        if (options?.welcomeOnboarding) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`welcome-onboarding:${userId}`}, 0))`;
          const previous = await tx.welcomeOnboarding.findUnique({ where: { userId }, select: { completedOrganizationId: true } });
          if (previous?.completedOrganizationId) {
            const membership = await tx.membership.findFirst({
              where: { userId, organizationId: previous.completedOrganizationId, status: "ACTIVE" },
              select: { organization: true },
            });
            if (membership) return membership.organization;
          }
        }
        const org = await tx.organization.create({
          data: { name: input.name, slug, legalName: input.legalName ?? null, document: input.document ?? null, timezone: input.timezone, createdById: userId },
        });
        const roles = await Promise.all(
          SYSTEM_ROLES.map((r) =>
            tx.role.create({
              data: { organizationId: org.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, isSystem: true },
            }),
          ),
        );
        const ownerRole = roles.find((r) => r.key === "OWNER");
        if (!ownerRole) throw new Error("Perfil OWNER não criado.");
        await tx.membership.create({ data: { organizationId: org.id, userId, roleId: ownerRole.id } });
        if (options?.professionalIdentity) {
          await tx.professionalIdentity.create({ data: { organizationId: org.id, userId, name: options.professionalIdentity.name, oabNumber: options.professionalIdentity.oabNumber, oabUf: options.professionalIdentity.oabUf, notifyEmail: options.professionalIdentity.notifyEmail ?? null, createdById: userId } });
        }
        await tx.subscription.create({
          data: {
            organizationId: org.id,
            planId: plan.id,
            status: "TRIALING",
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
          },
        });
        if (options?.welcomeOnboarding) {
          const now = new Date();
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`gift-user:${userId}`}, 0))`;
          const reservedGifts = await tx.giftCodeRedemption.findMany({
            where: { userId, status: "RESERVED" },
            include: { giftCode: true },
          });
          const validGifts = reservedGifts.map((redemption) => redemption.giftCode);
          for (const redemption of reservedGifts) {
            const gift = redemption.giftCode;
            if (redemption.reservationExpiresAt <= now) throw new ConflictError("A reserva do código expirou. Confira o código novamente para renová-la ou remova o benefício.");
            if (!gift.active || gift.revokedAt || gift.startsAt > now || (gift.expiresAt && gift.expiresAt <= now)) {
              throw new ConflictError("O código de presente reservado expirou ou foi revogado. Confira outro benefício antes de criar o escritório.");
            }
          }
          const planGifts = validGifts.filter((gift) => gift.benefitType === "PLAN_ACCESS");
          const planKeys = [...new Set(planGifts.map((gift) => gift.planKey).filter((key): key is string => Boolean(key)))];
          if (planKeys.length > 1) throw new ConflictError("Os códigos reservados concedem planos diferentes e não podem ser combinados.");
          let planId = plan.id;
          if (planKeys[0]) {
            const giftedPlan = await tx.plan.findFirst({ where: { key: planKeys[0], isPublic: true } });
            if (!giftedPlan) throw new ConflictError("O plano do benefício não está disponível. Entre em contato com a administração.");
            planId = giftedPlan.id;
          }
          if (validGifts.length) {
            const duration = (planGifts.length ? planGifts.reduce((sum, gift) => sum + gift.accessDays, 0) : TRIAL_DAYS) + validGifts.filter((gift) => gift.benefitType === "TRIAL_EXTENSION").reduce((sum, gift) => sum + gift.accessDays, 0);
            await tx.subscription.update({ where: { organizationId: org.id }, data: { planId, status: "TRIALING", trialEndsAt: new Date(now.getTime() + duration * 86_400_000), providerSubscriptionId: null, billingProvider: null } });
          }
          for (const redemption of reservedGifts) {
            const gift = redemption.giftCode;
            await tx.giftCodeRedemption.update({ where: { id: redemption.id }, data: { status: "APPLIED", organizationId: org.id, appliedAt: now } });
            await audit({ action: "gift_code.apply", organizationId: org.id, userId, resourceType: "gift_code", resourceId: gift.id, metadata: { benefitType: gift.benefitType, planKey: gift.planKey, accessDays: gift.accessDays }, meta }, tx);
          }
        }
        await audit(
          { action: "organization.create", organizationId: org.id, userId, resourceType: "organization", resourceId: org.id, meta },
          tx,
        );
        if (options?.welcomeOnboarding) {
          await tx.welcomeOnboarding.upsert({
            where: { userId },
            create: { userId, completedOrganizationId: org.id, currentStep: 4, data: options.welcomeOnboarding, completedAt: new Date() },
            update: { completedOrganizationId: org.id, currentStep: 4, data: options.welcomeOnboarding, completedAt: new Date() },
          });
        }
        return org;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // slug em uso
      throw err;
    }
  }
  throw new ConflictError("Não foi possível gerar um identificador único para o escritório.");
}

export async function listUserOrganizations(userId: string) {
  const rows = await db.membership.findMany({
    where: { userId, status: "ACTIVE", organization: { deletedAt: null, suspendedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { organization: { select: { id: true, name: true, slug: true } }, role: { select: { name: true, key: true } } },
  });
  return rows.map((r) => ({ ...r.organization, roleName: r.role.name, roleKey: r.role.key }));
}

export async function getOrganization(ctx: TenantContext) {
  return db.organization.findFirstOrThrow({
    where: { id: ctx.organizationId, deletedAt: null },
    include: { subscription: { include: { plan: true } } },
  });
}

export async function updateOrganization(
  ctx: TenantContext,
  input: { name: string; legalName?: string | null; document?: string | null; timezone: string },
) {
  assertCan(ctx, "organization:manage");
  const org = await db.organization.update({
    where: { id: ctx.organizationId },
    data: { name: input.name, legalName: input.legalName ?? null, document: input.document ?? null, timezone: input.timezone },
  });
  await audit({
    action: "organization.update",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    resourceType: "organization",
    resourceId: ctx.organizationId,
    metadata: { fields: ["name", "legalName", "document", "timezone"] },
    meta: ctx.meta,
  });
  return org;
}

/** 2.0-F6: exigir 2FA de todos os membros internos. Só liga se quem liga já tem 2FA (evita trancar a si mesmo). */
export async function setRequireMfa(ctx: TenantContext, required: boolean) {
  assertCan(ctx, "organization:manage");
  if (required) {
    const st = await mfaStatus(ctx.userId);
    if (!st.available) throw new ValidationError("A verificação em duas etapas não está habilitada neste sistema (falta MFA_ENCRYPTION_KEY).");
    if (!st.enabled) throw new ValidationError("Ative a sua própria verificação em duas etapas (Minha conta) antes de exigir dos outros.");
  }
  const before = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { requireMfa: true } });
  await db.organization.update({ where: { id: ctx.organizationId }, data: { requireMfa: required } });
  if ((before?.requireMfa ?? false) !== required) {
    await audit({ action: required ? "organization.require_mfa_enable" : "organization.require_mfa_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, meta: ctx.meta });
  }
}

/** Quantos membros internos ativos ainda não têm 2FA (para o administrador acompanhar). */
export async function mfaCoverage(ctx: TenantContext) {
  assertCan(ctx, "organization:manage");
  const members = await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", role: { key: { not: "CLIENT" } }, user: { disabledAt: null } }, select: { userId: true } });
  const withMfa = await db.userMfa.count({ where: { userId: { in: members.map((m) => m.userId) }, enabledAt: { not: null } } });
  return { total: members.length, withMfa, without: members.length - withMfa };
}
