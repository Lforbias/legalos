import { db } from "@/lib/db/client";
import { PILOT_TERMS_VERSION, pilotTermsRequired } from "@/lib/pilot-terms";
import type { TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/** true quando a pessoa ainda precisa aceitar a versão atual dos termos do piloto. */
export async function needsPilotTerms(userId: string): Promise<boolean> {
  if (!pilotTermsRequired()) return false;
  const row = await db.pilotTermAcceptance.findUnique({ where: { userId_version: { userId, version: PILOT_TERMS_VERSION } }, select: { id: true } });
  return !row;
}

/** Registra o aceite (idempotente): versão, data, IP e navegador, mais a trilha de auditoria. */
export async function acceptPilotTerms(ctx: TenantContext) {
  const existing = await db.pilotTermAcceptance.findUnique({ where: { userId_version: { userId: ctx.userId, version: PILOT_TERMS_VERSION } }, select: { id: true } });
  if (existing) return;
  const row = await db.pilotTermAcceptance.create({
    data: { userId: ctx.userId, organizationId: ctx.organizationId, version: PILOT_TERMS_VERSION, ipAddress: ctx.meta.ipAddress ?? null, userAgent: ctx.meta.userAgent?.slice(0, 300) ?? null },
    select: { id: true },
  });
  await audit({ action: "pilot.terms_accept", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "pilot_terms", resourceId: row.id, metadata: { version: PILOT_TERMS_VERSION }, meta: ctx.meta });
}
