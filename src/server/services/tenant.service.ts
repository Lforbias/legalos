import { db } from "@/lib/db/client";
import { OWNER_ROLE_KEY } from "@/lib/permissions/roles";
import type { RequestMeta, TenantContext } from "@/server/context";

/**
 * Constrói o TenantContext a partir de (userId, organizationId) verificando o vínculo no banco.
 * Retorna null se o usuário não for membro ATIVO do escritório (ou se o escritório foi removido).
 */
export async function resolveTenantContext(
  userId: string,
  organizationId: string,
  meta: RequestMeta = {},
): Promise<TenantContext | null> {
  const m = await db.membership.findFirst({
    where: { userId, organizationId, status: "ACTIVE", organization: { deletedAt: null, suspendedAt: null }, user: { disabledAt: null } },
    select: { id: true, roleId: true, role: { select: { key: true, permissions: true } }, organization: { select: { timezone: true } } },
  });
  if (!m) return null;
  return {
    userId,
    organizationId,
    membershipId: m.id,
    roleId: m.roleId,
    roleKey: m.role.key,
    permissions: new Set(m.role.permissions),
    isOwner: m.role.key === OWNER_ROLE_KEY,
    timezone: m.organization.timezone,
    meta,
  };
}
