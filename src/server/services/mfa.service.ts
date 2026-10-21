import crypto from "node:crypto";
import QRCode from "qrcode";
import { db } from "@/lib/db/client";
import { product } from "@/config/product";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { verifyPassword } from "@/lib/security/password";
import { decryptSecret, encryptSecret, generateTotpSecret, mfaKey, otpauthUri, verifyTotp } from "@/lib/security/totp";
import type { RequestMeta } from "@/server/context";
import { audit } from "./audit.service";

export const mfaAvailable = () => mfaKey() !== null;

export type MfaStatus = { available: boolean; enabled: boolean; recoveryCodesLeft: number };

export async function mfaStatus(userId: string): Promise<MfaStatus> {
  const [m, left] = await Promise.all([db.userMfa.findUnique({ where: { userId } }), db.mfaRecoveryCode.count({ where: { userId, usedAt: null } })]);
  return { available: mfaAvailable(), enabled: Boolean(m?.enabledAt), recoveryCodesLeft: left };
}

function requireKey(): Buffer {
  const k = mfaKey();
  if (!k) throw new ConflictError("A autenticação em duas etapas não está configurada neste sistema (falta MFA_ENCRYPTION_KEY).");
  return k;
}

const normalizeRecovery = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashRecovery = (c: string) => crypto.createHash("sha256").update(normalizeRecovery(c)).digest("hex");

function newRecoveryCodes(n = 10): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: n }, () => {
    const raw = Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = newRecoveryCodes();
  await db.$transaction([
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecovery(c) })) }),
  ]);
  return codes;
}

/** Começa (ou reinicia) o cadastro: gera um segredo ainda NÃO ativo e devolve chave + QR. */
export async function startEnrollment(userId: string, email: string) {
  const key = requireKey();
  const existing = await db.userMfa.findUnique({ where: { userId } });
  if (existing?.enabledAt) throw new ConflictError("A verificação em duas etapas já está ativa. Desative-a antes de cadastrar outro aplicativo.");
  const secret = generateTotpSecret();
  const secretEnc = encryptSecret(secret, key);
  await db.userMfa.upsert({ where: { userId }, create: { userId, secretEnc }, update: { secretEnc, lastStep: null } });
  const uri = otpauthUri(secret, email, product.name);
  return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 200 }) };
}

/** Confirma o cadastro com o primeiro código do app, ativa o MFA e devolve os códigos de recuperação (mostrados uma única vez). */
export async function confirmEnrollment(userId: string, code: string, meta: RequestMeta): Promise<string[]> {
  const key = requireKey();
  const row = await db.userMfa.findUnique({ where: { userId } });
  if (!row || row.enabledAt) throw new ConflictError("Não há cadastro de verificação em andamento.");
  const step = verifyTotp(decryptSecret(row.secretEnc, key), code.trim());
  if (step === null) throw new ValidationError("Código incorreto. Confira o horário do celular e tente de novo.", { code: ["Código incorreto."] });
  const act = await db.userMfa.updateMany({ where: { userId, enabledAt: null }, data: { enabledAt: new Date(), lastStep: BigInt(step) } });
  if (act.count !== 1) throw new ConflictError("Verificação em duas etapas já ativada.");
  const codes = await replaceRecoveryCodes(userId);
  await audit({ action: "auth.mfa_enabled", userId, meta });
  return codes;
}

/** Segundo fator no login: código do app (uma vez por janela de 30 s) ou código de recuperação (uso único). */
export async function verifySecondFactor(userId: string, rawCode: string): Promise<{ method: "totp" | "recovery" } | null> {
  const key = requireKey();
  const row = await db.userMfa.findUnique({ where: { userId } });
  if (!row?.enabledAt) return null;
  const code = rawCode.trim();
  if (/^\d{6}$/.test(code)) {
    const step = verifyTotp(decryptSecret(row.secretEnc, key), code);
    if (step === null) return null;
    // anti-replay atômico: só aceita passo maior que o último usado
    const res = await db.$executeRaw`UPDATE user_mfa SET last_step = ${BigInt(step)} WHERE user_id = ${userId}::uuid AND (last_step IS NULL OR last_step < ${BigInt(step)})`;
    return res === 1 ? { method: "totp" } : null;
  }
  if (normalizeRecovery(code).length === 10) {
    const res = await db.mfaRecoveryCode.updateMany({ where: { userId, codeHash: hashRecovery(code), usedAt: null }, data: { usedAt: new Date() } });
    return res.count === 1 ? { method: "recovery" } : null;
  }
  return null;
}

async function requirePassword(userId: string, password: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!u || !(await verifyPassword(password, u.passwordHash))) throw new ValidationError("Senha incorreta.", { password: ["Senha incorreta."] });
}

export async function disableMfa(userId: string, password: string, meta: RequestMeta) {
  await requirePassword(userId, password);
  const required = await db.membership.findFirst({ where: { userId, status: "ACTIVE", role: { key: { not: "CLIENT" } }, organization: { deletedAt: null, requireMfa: true } }, select: { organization: { select: { name: true } } } });
  if (required) throw new ConflictError(`O escritório ${required.organization.name} exige a verificação em duas etapas. Não é possível desativá-la enquanto você fizer parte dele.`);
  await db.$transaction([db.userMfa.deleteMany({ where: { userId } }), db.mfaRecoveryCode.deleteMany({ where: { userId } })]);
  await audit({ action: "auth.mfa_disabled", userId, meta });
}

export async function regenerateRecoveryCodes(userId: string, password: string, meta: RequestMeta): Promise<string[]> {
  await requirePassword(userId, password);
  const m = await db.userMfa.findUnique({ where: { userId } });
  if (!m?.enabledAt) throw new ConflictError("A verificação em duas etapas não está ativa.");
  const codes = await replaceRecoveryCodes(userId);
  await audit({ action: "auth.mfa_recovery_regenerated", userId, meta });
  return codes;
}
