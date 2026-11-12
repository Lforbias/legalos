import { can, type TenantContext } from "@/server/context";

export function isLegalMailOffice(organizationId: string): boolean {
  return organizationId === process.env.LEGALMAIL_ORGANIZATION_ID?.trim();
}

export function canImportLegalMail(ctx: TenantContext): boolean {
  return isLegalMailOffice(ctx.organizationId)
    && can(ctx, "integrations:manage")
    && can(ctx, "cases:read")
    && ctx.permissions.has("inbox:write");
}

export function canReadLegalMailInFunc(ctx: TenantContext): boolean {
  return isLegalMailOffice(ctx.organizationId)
    && can(ctx, "cases:read")
    && ctx.permissions.has("inbox:read");
}
