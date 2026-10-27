"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ValidationError } from "@/lib/permissions/check";
import { limiters } from "@/lib/security/rate-limit";
import type { ActionState } from "@/lib/validation/common";
import { parse, runAction, safeNext } from "@/server/action-helpers";
import { clearSessionCookie, getRequestMeta, getSessionToken, requireSession, setSessionCookie } from "@/server/session";
import * as auth from "@/server/services/auth.service";
import { decideRegistration, registrationMode } from "@/lib/security/registration";
import { acceptInvitation, previewInvitation } from "@/server/services/invitation.service";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "./schemas";

type Redirect = { redirectTo: string };
export type LoginResult = { redirectTo?: string; mfaChallenge?: string };

function tooMany(): never {
  throw new ValidationError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
}

export async function registerAction(input: unknown): Promise<ActionState<Redirect>> {
  return runAction(async () => {
    const data = parse(registerSchema, input);
    const meta = await getRequestMeta();
    if (!limiters.register.check(`ip:${meta.ipAddress ?? "?"}`)) tooMany();
    const invite = data.inviteToken ? await previewInvitation(data.inviteToken) : null;
    const decision = decideRegistration({ mode: registrationMode(), hasValidInvite: Boolean(invite && invite.email.toLowerCase() === data.email.trim().toLowerCase()), accessCode: data.accessCode, expectedCode: process.env.REGISTRATION_CODE });
    if (!decision.allowed) throw new ValidationError(decision.reason, { accessCode: [decision.reason] });
    const user = await auth.registerUser(data, meta);
    const session = await auth.login({ email: data.email, password: data.password }, meta);
    await setSessionCookie(session.token, session.expiresAt);
    if (data.inviteToken) {
      try {
        const { organizationId } = await acceptInvitation(user.id, data.inviteToken, meta);
        await auth.setActiveOrganization(user.id, session.sessionId, organizationId);
        return { redirectTo: "/dashboard" };
      } catch {
        // conta criada; o convite segue disponível para nova tentativa na própria página do convite
        return { redirectTo: `/accept-invite?token=${encodeURIComponent(data.inviteToken)}` };
      }
    }
    return { redirectTo: "/onboarding" };
  });
}

export async function loginAction(input: unknown): Promise<ActionState<LoginResult>> {
  return runAction(async () => {
    const data = parse(loginSchema, input);
    const meta = await getRequestMeta();
    const key = `${meta.ipAddress ?? "?"}:${data.email}`;
    if (!limiters.login.check(key)) tooMany();
    const redirectTo = data.inviteToken ? `/accept-invite?token=${encodeURIComponent(data.inviteToken)}` : safeNext(data.next);
    const r = await auth.startLogin(data, meta, redirectTo);
    limiters.login.reset(key);
    if (r.kind === "mfa") return { mfaChallenge: r.challengeToken };
    await setSessionCookie(r.token, r.expiresAt);
    return { redirectTo };
  });
}

export async function verifyMfaAction(input: { challenge: string; code: string }): Promise<ActionState<LoginResult>> {
  return runAction(async () => {
    const data = parse(z.object({ challenge: z.string().min(10).max(200), code: z.string().trim().min(6).max(20) }), input);
    const meta = await getRequestMeta();
    if (!limiters.mfa.check(`ip:${meta.ipAddress ?? "?"}`)) tooMany();
    const r = await auth.completeMfaLogin(data.challenge, data.code, meta);
    await setSessionCookie(r.token, r.expiresAt);
    return { redirectTo: safeNext(r.redirectTo) };
  });
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) await auth.logout(token, await getRequestMeta());
  await clearSessionCookie();
  redirect("/login");
}

export async function forgotPasswordAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const data = parse(forgotPasswordSchema, input);
    const meta = await getRequestMeta();
    if (!limiters.passwordReset.check(`ip:${meta.ipAddress ?? "?"}`)) tooMany();
    await auth.requestPasswordReset(data.email, meta);
    return undefined;
  });
}

export async function resetPasswordAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const data = parse(resetPasswordSchema, input);
    await auth.resetPassword(data.token, data.password, await getRequestMeta());
    return undefined;
  });
}

export async function verifyEmailAction(input: { token: string }): Promise<ActionState> {
  return runAction(async () => {
    await auth.verifyEmail(String(input.token ?? ""), await getRequestMeta());
    return undefined;
  });
}

export async function resendVerificationAction(): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession();
    if (!limiters.passwordReset.check(`verify:${session.user.id}`)) tooMany();
    await auth.resendVerification(session.user.id);
    return undefined;
  });
}

export async function acceptInviteAction(input: { token: string }): Promise<ActionState<Redirect>> {
  return runAction(async () => {
    const session = await requireSession();
    const meta = await getRequestMeta();
    if (!limiters.invitation.check(`accept:${session.user.id}`)) tooMany();
    const { organizationId } = await acceptInvitation(session.user.id, String(input.token ?? ""), meta);
    await auth.setActiveOrganization(session.user.id, session.id, organizationId);
    return { redirectTo: "/dashboard" };
  });
}
