import { z } from "zod";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { certKey, openBytes, sealBytes } from "@/lib/security/pfx";
import { RateLimiter } from "@/lib/security/rate-limit";
import { totpCode, totpStep, verifyTotp } from "@/lib/security/totp";
import { parseCourtOtpSecret } from "@/lib/pje/otp";
import { assertCan, type TenantContext } from "@/server/context";
import { verifySecondFactor } from "./mfa.service";
import { audit } from "./audit.service";

const attempts = new RateLimiter(10, 15 * 60_000);
function key() { const k = certKey(); if (!k) throw new ConflictError("O cofre dos tribunais não está habilitado."); return k; }
async function authorize(ctx: TenantContext, code: string) {
  assertCan(ctx, "cases:read");
  if (!attempts.check(`${ctx.organizationId}:${ctx.userId}`)) throw new ConflictError("Muitas tentativas. Aguarde alguns minutos.");
  if (!await verifySecondFactor(ctx.userId, code)) throw new ValidationError("Informe o código atual do 2FA do LegalOS. Cada código só pode ser usado uma vez.");
}
export async function listCourtOtps(ctx: TenantContext) {
  assertCan(ctx, "cases:read");
  return db.courtOtpAuthenticator.findMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId, revokedAt: null }, select: { id: true, label: true, createdAt: true }, orderBy: { createdAt: "desc" } });
}
export async function saveCourtOtp(ctx: TenantContext, raw: unknown) {
  const input = z.object({ label: z.string().trim().min(3).max(80), secret: z.string().max(2048), confirmationCode: z.string().regex(/^\d{6}$/), authorizationCode: z.string().min(6).max(30) }).parse(raw);
  const k = key();
  await authorize(ctx, input.authorizationCode);
  const secret = parseCourtOtpSecret(input.secret);
  if (verifyTotp(secret, input.confirmationCode) === null) throw new ValidationError("O código do autenticador do tribunal não corresponde à chave. Confira a chave e o relógio.");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`court-otp:${ctx.organizationId}:${ctx.userId}`}))`;
    if (await tx.courtOtpAuthenticator.count({ where: { organizationId: ctx.organizationId, userId: ctx.userId, revokedAt: null } }) >= 10) throw new ConflictError("Limite de 10 autenticadores ativos.");
    const row = await tx.courtOtpAuthenticator.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, label: input.label, secretEnc: sealBytes(Buffer.from(secret), k) }, select: { id: true } });
    await audit({ action: "court_otp.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_otp", resourceId: row.id, meta: ctx.meta }, tx);
    return row;
  });
}
export async function revealCourtOtp(ctx: TenantContext, id: string, authorizationCode: string) {
  assertCan(ctx, "cases:read");
  const row = await db.courtOtpAuthenticator.findFirst({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId, revokedAt: null } });
  if (!row) throw new NotFoundError("Autenticador não encontrado.");
  await authorize(ctx, authorizationCode);
  const now = Date.now();
  const code = totpCode(openBytes(row.secretEnc, key()).toString("utf8"), totpStep(now));
  await audit({ action: "court_otp.reveal", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_otp", resourceId: id, meta: ctx.meta });
  return { code, expiresAt: new Date((totpStep(now) + 1) * 30_000).toISOString() };
}
export async function revokeCourtOtp(ctx: TenantContext, id: string, authorizationCode: string) {
  await authorize(ctx, authorizationCode);
  const changed = await db.courtOtpAuthenticator.updateMany({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId, revokedAt: null }, data: { secretEnc: "", revokedAt: new Date() } });
  if (changed.count !== 1) throw new NotFoundError("Autenticador não encontrado.");
  await audit({ action: "court_otp.revoke", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_otp", resourceId: id, meta: ctx.meta });
}
