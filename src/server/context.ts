import type { PermissionKey } from "@/lib/permissions/catalog";
import { ForbiddenError } from "@/lib/permissions/check";

/**
 * Contexto de tenant. É construído SEMPRE no servidor, a partir da sessão (cookie httpOnly) e da
 * associação (Membership) verificada no banco. Nunca a partir de IDs enviados pelo navegador.
 * Todo serviço de domínio recebe um TenantContext e filtra por `organizationId`.
 */
export type RequestMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

export type TenantContext = {
  userId: string;
  organizationId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  permissions: ReadonlySet<string>;
  isOwner: boolean;
  /** Fuso horário do escritório (IANA) — usado para "hoje", vencimentos e atrasos. */
  timezone: string;
  meta: RequestMeta;
};

export function can(ctx: TenantContext, permission: PermissionKey): boolean {
  return ctx.permissions.has(permission);
}

export function assertCan(ctx: TenantContext, permission: PermissionKey): void {
  if (!can(ctx, permission)) throw new ForbiddenError();
}
