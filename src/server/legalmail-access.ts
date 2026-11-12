import { db } from "@/lib/db/client";
import { can, type TenantContext } from "@/server/context";

export async function legalMailOfficeId(): Promise<string | null> {
  const configured = process.env.LEGALMAIL_ORGANIZATION_ID?.trim();
  if (configured) return configured;
  const [pilot] = await db.$queryRaw<{ organization_id: string }[]>`
    SELECT organization_id FROM legalmail_pilot WHERE singleton
  `;
  return pilot?.organization_id ?? null;
}

export async function isLegalMailOffice(organizationId: string): Promise<boolean> {
  return organizationId === await legalMailOfficeId();
}

export async function canImportLegalMail(ctx: TenantContext): Promise<boolean> {
  return can(ctx, "integrations:manage")
    && can(ctx, "cases:read")
    && ctx.permissions.has("inbox:write")
    && await isLegalMailOffice(ctx.organizationId);
}

export async function canReadLegalMailInFunc(ctx: TenantContext): Promise<boolean> {
  return can(ctx, "cases:read")
    && ctx.permissions.has("inbox:read")
    && await isLegalMailOffice(ctx.organizationId);
}
