import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/permissions/check";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/security/password";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { sendMailSafe } from "@/lib/mail/mailer";
import { product } from "@/config/product";
import { normalizeEmail } from "@/lib/validation/email";
import type { RequestMeta } from "@/server/context";
import { audit } from "./audit.service";
import { verifySecondFactor } from "./mfa.service";

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: Date | null;
  locale: string;
  timezone: string;
};

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  emailVerifiedAt: true,
  locale: true,
  timezone: true,
} satisfies Prisma.UserSelect;

async function issueEmailToken(userId: string, type: "VERIFY_EMAIL" | "PASSWORD_RESET", ttlMs: number) {
  const token = generateToken();
  // invalida tokens anteriores ainda não usados do mesmo tipo
  await db.emailToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await db.emailToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

export async function registerUser(input: { name: string; email: string; password: string }, meta: RequestMeta) {
  const passwordHash = await hashPassword(input.password);
  let user;
  try {
    user = await db.user.create({
      data: { name: input.name, email: normalizeEmail(input.email), passwordHash },
      select: publicUserSelect,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await audit({ action: "auth.register", result: "FAILURE", metadata: { reason: "email_exists" }, meta });
      throw new ConflictError("Já existe uma conta com este e-mail.");
    }
    throw err;
  }
  const token = await issueEmailToken(user.id, "VERIFY_EMAIL", EMAIL_TOKEN_TTL_MS);
  await sendMailSafe({
    to: user.email,
    subject: `Confirme seu e-mail — ${product.name}`,
    text: `Confirme seu e-mail: ${appUrl(`/verify-email?token=${token}`)}`,
  });
  await audit({ action: "auth.register", userId: user.id, resourceType: "user", resourceId: user.id, meta });
  return user;
}

export async function createSession(userId: string, meta: RequestMeta, activeOrganizationId?: string | null) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ipAddress: meta.ipAddress ?? null,
      activeOrganizationId: activeOrganizationId ?? null,
    },
  });
  return { token, expiresAt, sessionId: session.id };
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

/** Confere e-mail/senha, com bloqueio temporário após falhas seguidas. A mensagem é sempre a mesma (anti-enumeração). */
async function checkCredentials(input: { email: string; password: string }, meta: RequestMeta) {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(input.email) } });
  // Executa o hash mesmo sem usuário para igualar o tempo de resposta (evita enumeração por timing).
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  const locked = Boolean(user?.lockedUntil && user.lockedUntil > new Date());
  if (!user || !ok || user.disabledAt || locked) {
    if (user && !ok && !locked && !user.disabledAt) {
      const upd = await db.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
      if (upd.failedLoginCount >= MAX_FAILED_LOGINS) {
        await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } });
        await audit({ action: "auth.account_locked", userId: user.id, metadata: { minutes: LOCK_MS / 60000 }, meta });
      }
    }
    await audit({
      action: "auth.login",
      result: "FAILURE",
      userId: user?.id ?? null,
      metadata: { reason: !user ? "unknown_user" : user.disabledAt ? "disabled" : locked ? "locked" : "bad_password" },
      meta,
    });
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }
  return user;
}

async function openSession(user: { id: string; name: string; email: string }, meta: RequestMeta) {
  const memberships = await db.membership.findMany({
    where: { userId: user.id, status: "ACTIVE", organization: { deletedAt: null, suspendedAt: null } },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { organizationId: true },
  });
  const session = await createSession(user.id, meta, memberships[0]?.organizationId ?? null);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
  await audit({ action: "auth.login", userId: user.id, meta, resourceType: "session", resourceId: session.sessionId });
  return { ...session, user: { id: user.id, name: user.name, email: user.email } };
}

/** Login sem segundo fator. Recusa contas com MFA ativo (estas passam obrigatoriamente por `startLogin`). */
export async function login(input: { email: string; password: string }, meta: RequestMeta) {
  const user = await checkCredentials(input, meta);
  const mfa = await db.userMfa.findUnique({ where: { userId: user.id }, select: { enabledAt: true } });
  if (mfa?.enabledAt) throw new UnauthorizedError("Esta conta exige o código de verificação em duas etapas.");
  return openSession(user, meta);
}

export type StartLoginResult =
  | { kind: "session"; token: string; expiresAt: Date; sessionId: string; user: { id: string; name: string; email: string } }
  | { kind: "mfa"; challengeToken: string };

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MFA_MAX_ATTEMPTS = 5;

/** Login em duas etapas: com MFA ativo devolve um desafio de 5 minutos em vez de abrir a sessão. */
export async function startLogin(input: { email: string; password: string }, meta: RequestMeta, redirectTo: string): Promise<StartLoginResult> {
  const user = await checkCredentials(input, meta);
  const mfa = await db.userMfa.findUnique({ where: { userId: user.id }, select: { enabledAt: true } });
  if (!mfa?.enabledAt) return { kind: "session", ...(await openSession(user, meta)) };
  const token = generateToken();
  await db.mfaChallenge.create({ data: { userId: user.id, tokenHash: hashToken(token), redirectTo, expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS) } });
  await audit({ action: "auth.mfa_challenge", userId: user.id, meta });
  return { kind: "mfa", challengeToken: token };
}

/** Conclui o login com o código do app (ou um código de recuperação). Máximo de 5 tentativas por desafio. */
export async function completeMfaLogin(challengeToken: string, code: string, meta: RequestMeta) {
  const ch = await db.mfaChallenge.findUnique({ where: { tokenHash: hashToken(challengeToken) }, include: { user: true } });
  if (!ch || ch.usedAt || ch.expiresAt <= new Date() || ch.user.disabledAt || ch.attempts >= MFA_MAX_ATTEMPTS) throw new UnauthorizedError("Verificação expirada. Entre novamente com e-mail e senha.");
  // conta a tentativa ANTES de conferir (atômico): tentativas simultâneas não passam do limite
  const claimed = await db.mfaChallenge.updateMany({ where: { id: ch.id, usedAt: null, attempts: { lt: MFA_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
  if (claimed.count !== 1) throw new UnauthorizedError("Verificação expirada. Entre novamente com e-mail e senha.");
  const result = await verifySecondFactor(ch.userId, code);
  if (!result) {
    await audit({ action: "auth.mfa_verify", result: "FAILURE", userId: ch.userId, meta });
    throw new UnauthorizedError("Código inválido.");
  }
  const used = await db.mfaChallenge.updateMany({ where: { id: ch.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) throw new UnauthorizedError("Verificação expirada. Entre novamente com e-mail e senha.");
  await audit({ action: "auth.mfa_verify", userId: ch.userId, metadata: { method: result.method }, meta });
  const session = await openSession(ch.user, meta);
  return { ...session, redirectTo: ch.redirectTo };
}

export type ValidSession = {
  id: string;
  activeOrganizationId: string | null;
  user: PublicUser;
};

export async function getSessionByToken(token: string): Promise<ValidSession | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { ...publicUserSelect, disabledAt: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.disabledAt) return null;
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  const { disabledAt: _d, ...user } = session.user;
  return { id: session.id, activeOrganizationId: session.activeOrganizationId, user };
}

export async function logout(token: string, meta: RequestMeta) {
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session || session.revokedAt) return;
  await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await audit({ action: "auth.logout", userId: session.userId, resourceType: "session", resourceId: session.id, meta });
}

export async function listSessions(userId: string) {
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true },
  });
}

/** Só revoga sessões do próprio usuário (a condição userId impede IDOR). */
export async function revokeSession(userId: string, sessionId: string, meta: RequestMeta) {
  const res = await db.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw new NotFoundError("Sessão não encontrada.");
  await audit({ action: "auth.session_revoked", userId, resourceType: "session", resourceId: sessionId, meta });
}

export async function revokeOtherSessions(userId: string, currentSessionId: string, meta: RequestMeta) {
  const res = await db.session.updateMany({
    where: { userId, revokedAt: null, id: { not: currentSessionId } },
    data: { revokedAt: new Date() },
  });
  await audit({ action: "auth.sessions_revoked_others", userId, metadata: { count: res.count }, meta });
  return res.count;
}

/** Define o escritório ativo da sessão, após confirmar vínculo ATIVO do usuário. */
export async function setActiveOrganization(userId: string, sessionId: string, organizationId: string) {
  const membership = await db.membership.findFirst({
    where: { userId, organizationId, status: "ACTIVE", organization: { deletedAt: null, suspendedAt: null } },
    select: { id: true },
  });
  if (!membership) throw new NotFoundError("Escritório não encontrado.");
  await db.session.updateMany({ where: { id: sessionId, userId }, data: { activeOrganizationId: organizationId } });
}

export async function requestPasswordReset(email: string, meta: RequestMeta) {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true, email: true, disabledAt: true } });
  // Resposta externa é idêntica existindo ou não a conta (anti-enumeração).
  if (!user || user.disabledAt) {
    await audit({ action: "auth.password_reset_requested", result: "FAILURE", metadata: { reason: "unknown_user" }, meta });
    return;
  }
  const token = await issueEmailToken(user.id, "PASSWORD_RESET", RESET_TOKEN_TTL_MS);
  await sendMailSafe({
    to: user.email,
    subject: `Redefinição de senha — ${product.name}`,
    text: `Redefina sua senha (válido por 1 hora): ${appUrl(`/reset-password?token=${token}`)}`,
  });
  await audit({ action: "auth.password_reset_requested", userId: user.id, meta });
}

async function consumeEmailToken(token: string, type: "VERIFY_EMAIL" | "PASSWORD_RESET") {
  const res = await db.emailToken.updateMany({
    where: { tokenHash: hashToken(token), type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (res.count !== 1) return null;
  const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { userId: true } });
  return row?.userId ?? null;
}

export async function resetPassword(token: string, newPassword: string, meta: RequestMeta) {
  const userId = await consumeEmailToken(token, "PASSWORD_RESET");
  if (!userId) throw new ValidationError("Link de redefinição inválido ou expirado.");
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash } }),
    // senha redefinida => todas as sessões existentes deixam de valer
    db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ action: "auth.password_reset", userId, meta });
}

export async function verifyEmail(token: string, meta: RequestMeta) {
  const userId = await consumeEmailToken(token, "VERIFY_EMAIL");
  if (!userId) throw new ValidationError("Link de verificação inválido ou expirado.");
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ action: "auth.email_verified", userId, meta });
}

export async function resendVerification(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (!user || user.emailVerifiedAt) return;
  const token = await issueEmailToken(user.id, "VERIFY_EMAIL", EMAIL_TOKEN_TTL_MS);
  await sendMailSafe({
    to: user.email,
    subject: `Confirme seu e-mail — ${product.name}`,
    text: `Confirme seu e-mail: ${appUrl(`/verify-email?token=${token}`)}`,
  });
}

export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    await audit({ action: "auth.password_change", userId, result: "FAILURE", meta });
    throw new ValidationError("Senha atual incorreta.", { currentPassword: ["Senha atual incorreta."] });
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await db.session.updateMany({ where: { userId, revokedAt: null, id: { not: currentSessionId } }, data: { revokedAt: new Date() } });
  await audit({ action: "auth.password_change", userId, meta });
}

export async function updateProfile(
  userId: string,
  input: { name: string; locale: string; timezone: string },
  meta: RequestMeta,
) {
  await db.user.update({ where: { id: userId }, data: input });
  await audit({ action: "user.profile_update", userId, resourceType: "user", resourceId: userId, meta });
}
