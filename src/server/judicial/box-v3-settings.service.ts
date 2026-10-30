import "server-only";
import { db } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/permissions/check";
import { getCourtSystem } from "@/lib/court-systems";
import type { TenantContext } from "@/server/context";

/** Read-only inventory for Box 3.0. Secret blobs, passwords, PFX bytes and certificate fingerprints are never selected. */
export async function getBoxV3SettingsSnapshot(ctx: TenantContext) {
  const canReadCertificates = ctx.permissions.has("certificates:manage");
  const canReadAllCredentials = ctx.permissions.has("integrations:manage");
  const canReadOwnCredentials = ctx.permissions.has("cases:read");
  if (!canReadCertificates && !canReadAllCredentials && !canReadOwnCredentials) throw new ForbiddenError();

  const [certificateRows, credentialRows] = await Promise.all([
    canReadCertificates
      ? db.certificate.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { notAfter: "asc" }],
          select: { id: true, label: true, ownerUserId: true, notAfter: true, revokedAt: true, consultationOnly: true, signingEnabledAt: true, authorized: { select: { userId: true, canSign: true } } },
        })
      : Promise.resolve([]),
    canReadAllCredentials || canReadOwnCredentials
      ? db.courtCredential.findMany({
          where: { organizationId: ctx.organizationId, ...(!canReadAllCredentials ? { userId: ctx.userId } : {}) },
          orderBy: [{ system: "asc" }, { courtCode: "asc" }, { userId: "asc" }],
          select: { id: true, userId: true, system: true, courtCode: true, authMode: true, checkedAt: true, checkStatus: true },
        })
      : Promise.resolve([]),
  ]);

  const userIds = [...new Set([
    ...certificateRows.map((item) => item.ownerUserId),
    ...certificateRows.flatMap((item) => item.authorized.map((user) => user.userId)),
    ...credentialRows.map((item) => item.userId),
  ])];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  const now = Date.now();

  return {
    canReadCertificates,
    canReadAllCredentials,
    certificates: certificateRows.map((item) => ({
      id: item.id,
      label: item.label,
      ownerUserId: item.ownerUserId,
      owner: names.get(item.ownerUserId) ?? "Integrante removido",
      expiresAt: item.notAfter,
      state: item.revokedAt ? "REVOKED" : item.notAfter.getTime() <= now ? "EXPIRED" : item.notAfter.getTime() - now <= 30 * 86_400_000 ? "EXPIRING" : "ACTIVE",
      consultationOnly: item.consultationOnly,
      signingEnabledAt: item.signingEnabledAt,
      authorizedUsers: item.authorized.map((user) => ({ userId: user.userId, name: names.get(user.userId) ?? "Integrante removido", canSign: user.canSign })),
    })),
    credentials: credentialRows.map((item) => ({
      id: item.id,
      owner: names.get(item.userId) ?? "Integrante removido",
      mine: item.userId === ctx.userId,
      system: getCourtSystem(item.system)?.label ?? item.system,
      courtCode: item.courtCode || "Geral",
      authMode: item.authMode,
      checkedAt: item.checkedAt,
      checkStatus: item.checkStatus,
    })),
  };
}
