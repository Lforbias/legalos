import { db } from "@/lib/db/client";
import { ALL_PERMISSIONS, isPermissionKey } from "@/lib/permissions/catalog";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, isSubset } from "@/lib/permissions/check";
import { ROLE_TEMPLATES, SENSITIVE_PERMISSIONS } from "@/lib/permissions/templates";
import { slugify } from "@/lib/validation/slug";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

export async function listRoles(ctx: TenantContext) {
  assertCan(ctx, "members:read");
  const roles = await db.role.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { _count: { select: { memberships: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    permissions: r.permissions,
    isSystem: r.isSystem,
    memberCount: r._count.memberships,
  }));
}

function normalizePermissions(input: string[]): string[] {
  const unique = [...new Set(input)];
  const invalid = unique.filter((p) => !isPermissionKey(p));
  if (invalid.length) throw new ValidationError("Permissões inválidas.", { permissions: invalid.map((p) => `Permissão desconhecida: ${p}`) });
  return ALL_PERMISSIONS.filter((p) => unique.includes(p));
}

/** Regra anti-escalonamento: só é possível conceder permissões que o próprio ator possui. */
function assertCanGrant(ctx: TenantContext, permissions: string[]) {
  if (ctx.isOwner) return;
  if (!isSubset(permissions, ctx.permissions)) {
    throw new ForbiddenError("Você não pode conceder permissões que você mesmo não possui.");
  }
}

export async function createRole(ctx: TenantContext, input: { name: string; description?: string | null; permissions: string[] }) {
  assertCan(ctx, "roles:manage");
  const permissions = normalizePermissions(input.permissions);
  assertCanGrant(ctx, permissions);
  const key = `custom_${slugify(input.name) || "perfil"}_${Math.random().toString(36).slice(2, 6)}`;
  const role = await db.role.create({
    data: { organizationId: ctx.organizationId, key, name: input.name, description: input.description ?? null, permissions, isSystem: false },
  });
  await audit({
    action: "role.create",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    resourceType: "role",
    resourceId: role.id,
    metadata: { permissions },
    meta: ctx.meta,
  });
  return role;
}

export async function updateRole(
  ctx: TenantContext,
  roleId: string,
  input: { name: string; description?: string | null; permissions: string[] },
) {
  assertCan(ctx, "roles:manage");
  const role = await db.role.findFirst({ where: { id: roleId, organizationId: ctx.organizationId } });
  if (!role) throw new NotFoundError("Perfil não encontrado.");
  if (role.isSystem) throw new ForbiddenError("Perfis de sistema não podem ser editados. Crie um perfil personalizado.");
  const permissions = normalizePermissions(input.permissions);
  assertCanGrant(ctx, permissions);
  // também não é permitido editar um perfil mais poderoso do que o ator
  assertCanGrant(ctx, role.permissions);
  await db.role.update({ where: { id: role.id }, data: { name: input.name, description: input.description ?? null, permissions } });
  await audit({
    action: "role.update",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    resourceType: "role",
    resourceId: role.id,
    metadata: { before: role.permissions, after: permissions },
    meta: ctx.meta,
  });
}

export async function deleteRole(ctx: TenantContext, roleId: string) {
  assertCan(ctx, "roles:manage");
  const role = await db.role.findFirst({
    where: { id: roleId, organizationId: ctx.organizationId },
    include: { _count: { select: { memberships: true, invitations: true } } },
  });
  if (!role) throw new NotFoundError("Perfil não encontrado.");
  if (role.isSystem) throw new ForbiddenError("Perfis de sistema não podem ser excluídos.");
  if (role._count.memberships > 0 || role._count.invitations > 0) {
    throw new ConflictError("Há membros ou convites usando este perfil. Reatribua-os antes de excluir.");
  }
  await db.role.delete({ where: { id: role.id } });
  await audit({
    action: "role.delete",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    resourceType: "role",
    resourceId: role.id,
    meta: ctx.meta,
  });
}

// ======================= 2.0-F11: modelos com o mínimo de acesso e revisão de acessos =======================

export function listRoleTemplates(ctx: TenantContext) {
  assertCan(ctx, "members:read");
  return ROLE_TEMPLATES;
}

/** Cria um perfil personalizado a partir de um modelo. Vale a regra anti-escalonamento (só concede o que você mesmo tem). */
export async function createRoleFromTemplate(ctx: TenantContext, templateKey: string) {
  assertCan(ctx, "roles:manage");
  const t = ROLE_TEMPLATES.find((x) => x.key === templateKey);
  if (!t) throw new NotFoundError("Modelo não encontrado.");
  if (await db.role.findFirst({ where: { organizationId: ctx.organizationId, name: t.name }, select: { id: true } })) throw new ConflictError(`Já existe um perfil chamado “${t.name}”.`);
  return createRole(ctx, { name: t.name, description: t.description, permissions: t.permissions });
}

export type AccessReviewRow = { userId: string; name: string; email: string; role: string; sensitive: string[]; mfaEnabled: boolean; atRisk: boolean };

/** Quem tem acessos sensíveis e se tem 2FA ligado. `atRisk` = acesso sensível sem 2FA. Somente leitura; exige `roles:manage`. */
export async function accessReview(ctx: TenantContext): Promise<{ rows: AccessReviewRow[]; owners: number }> {
  assertCan(ctx, "roles:manage");
  const members = await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", user: { disabledAt: null } }, select: { userId: true, user: { select: { name: true, email: true } }, role: { select: { key: true, name: true, permissions: true } } } });
  const mfa = await db.userMfa.findMany({ where: { userId: { in: members.map((m) => m.userId) }, enabledAt: { not: null } }, select: { userId: true } });
  const has = new Set(mfa.map((x) => x.userId));
  const rows = members
    .filter((m) => m.role.key !== "CLIENT")
    .map((m) => {
      const sensitive = SENSITIVE_PERMISSIONS.filter((p) => m.role.permissions.includes(p));
      const mfaEnabled = has.has(m.userId);
      return { userId: m.userId, name: m.user.name, email: m.user.email, role: m.role.name, sensitive, mfaEnabled, atRisk: sensitive.length > 0 && !mfaEnabled };
    })
    .sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || b.sensitive.length - a.sensitive.length || a.name.localeCompare(b.name));
  return { rows, owners: members.filter((m) => m.role.key === "OWNER").length };
}
