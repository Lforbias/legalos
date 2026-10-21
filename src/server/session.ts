import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { mfaBlockedFor } from "@/lib/mfa-policy";
import type { RequestMeta, TenantContext } from "@/server/context";
import { getSessionByToken, type ValidSession } from "@/server/services/auth.service";
import { resolveTenantContext } from "@/server/services/tenant.service";

import { SESSION_COOKIE } from "@/lib/auth/cookie";

const isProd = process.env.NODE_ENV === "production";

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
    correlationId: h.get("x-request-id"),
  };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export const getSession = cache(async (): Promise<ValidSession | null> => {
  const token = await getSessionToken();
  return token ? getSessionByToken(token) : null;
});

export async function requireSession(): Promise<ValidSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export type Tenant = {
  /** O escritório exige 2FA e esta pessoa ainda não ativou: só a tela de ativação é permitida. */
  mfaBlocked: boolean;
  session: ValidSession;
  ctx: TenantContext;
  organization: { id: string; name: string; slug: string; timezone: string };
};

/**
 * Resolve usuário + escritório ativo. O escritório vem da sessão no servidor e é revalidado contra o
 * vínculo (Membership) a cada requisição. Se não houver escritório válido, escolhe o primeiro
 * vínculo ativo; sem nenhum, retorna null (o chamador redireciona para /onboarding).
 */
const loadTenant = cache(async (): Promise<Tenant | null> => {
  const session = await getSession();
  if (!session) return null;
  const meta = await getRequestMeta();

  let orgId = session.activeOrganizationId;
  let ctx = orgId ? await resolveTenantContext(session.user.id, orgId, meta) : null;
  if (!ctx) {
    const first = await db.membership.findFirst({
      where: { userId: session.user.id, status: "ACTIVE", organization: { deletedAt: null, suspendedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    });
    if (!first) return null;
    orgId = first.organizationId;
    ctx = await resolveTenantContext(session.user.id, orgId, meta);
    if (!ctx) return null;
    await db.session.update({ where: { id: session.id }, data: { activeOrganizationId: orgId } });
  }
  const organization = await db.organization.findFirstOrThrow({
    where: { id: ctx.organizationId, deletedAt: null },
    select: { id: true, name: true, slug: true, timezone: true, requireMfa: true },
  });
  let mfaBlocked = false;
  if (organization.requireMfa && ctx.roleKey !== "CLIENT") {
    const m = await db.userMfa.findUnique({ where: { userId: session.user.id }, select: { enabledAt: true } });
    mfaBlocked = mfaBlockedFor(organization.requireMfa, ctx.roleKey, Boolean(m?.enabledAt));
  }
  return { mfaBlocked, session, ctx, organization: { id: organization.id, name: organization.name, slug: organization.slug, timezone: organization.timezone } };
});

/** Para rotas de API: devolve null (sem acesso) enquanto a pessoa não cumprir a exigência de 2FA do escritório. */
export async function getTenant(): Promise<Tenant | null> {
  const t = await loadTenant();
  return t && !t.mfaBlocked ? t : null;
}

export async function requireTenant(): Promise<Tenant> {
  const session = await getSession();
  if (!session) redirect("/login");
  const tenant = await loadTenant();
  if (tenant?.mfaBlocked) redirect("/exigir-2fa");
  if (!tenant) {
    const suspended = await db.membership.findFirst({ where: { userId: session.user.id, status: "ACTIVE", organization: { deletedAt: null, suspendedAt: { not: null } } }, select: { id: true } });
    redirect(suspended ? "/suspenso" : "/onboarding");
  }
  return tenant;
}
