import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { SYSTEM_ROLES } from "@/lib/permissions/roles";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { slugify } from "@/lib/validation/slug";
import { assertCan, type RequestMeta, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { mfaStatus } from "./mfa.service";

const TRIAL_DAYS = 14;
const TRIAL_PLAN_KEY = "profissional";
const MAX_ORGS_PER_USER = 10;

/**
 * Cria escritório + perfis de sistema + vínculo do criador como Proprietário + assinatura em trial,
 * tudo em uma única transação. O trial NÃO envolve cobrança (não há provedor integrado).
 */
export async function createOrganization(
  userId: string,
  input: { name: string; timezone: string; legalName?: string | null },
  meta: RequestMeta,
) {
  const owned = await db.membership.count({ where: { userId, role: { key: "OWNER" } } });
  if (owned >= MAX_ORGS_PER_USER) throw new ConflictError("Limite de escritórios por usuário atingido.");

  const plan = await db.plan.findUnique({ where: { key: TRIAL_PLAN_KEY } });
  if (!plan) throw new Error(`Plano ${TRIAL_PLAN_KEY} não encontrado. Execute as migrations.`);

  const base = slugify(input.name) || "escritorio";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      return await db.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name: input.name, slug, legalName: input.legalName ?? null, timezone: input.timezone, createdById: userId },
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
        await tx.subscription.create({
          data: {
            organizationId: org.id,
            planId: plan.id,
            status: "TRIALING",
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
          },
        });
        await audit(
          { action: "organization.create", organizationId: org.id, userId, resourceType: "organization", resourceId: org.id, meta },
          tx,
        );
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
