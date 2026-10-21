"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { getRequestMeta, requireSession } from "@/server/session";
import { z } from "zod";
import * as mfa from "@/server/services/mfa.service";
import * as auth from "@/server/services/auth.service";
import { changePasswordSchema, profileSchema } from "./schemas";

export async function updateProfileAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession();
    await auth.updateProfile(session.user.id, parse(profileSchema, input), await getRequestMeta());
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function changePasswordAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession();
    await auth.changePassword(session.user.id, session.id, parse(changePasswordSchema, input), await getRequestMeta());
    return undefined;
  });
}

export async function revokeSessionAction(sessionId: string): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession();
    await auth.revokeSession(session.user.id, parse(uuidSchema, sessionId), await getRequestMeta());
    revalidatePath("/conta");
    return undefined;
  });
}

export async function revokeOtherSessionsAction(): Promise<ActionState<{ count: number }>> {
  return runAction(async () => {
    const session = await requireSession();
    const count = await auth.revokeOtherSessions(session.user.id, session.id, await getRequestMeta());
    revalidatePath("/conta");
    return { count };
  });
}

export async function startMfaAction(): Promise<ActionState<{ secret: string; qrDataUrl: string }>> {
  return runAction(async () => {
    const session = await requireSession();
    const r = await mfa.startEnrollment(session.user.id, session.user.email);
    return { secret: r.secret, qrDataUrl: r.qrDataUrl };
  });
}

export async function confirmMfaAction(code: string): Promise<ActionState<{ codes: string[] }>> {
  return runAction(async () => {
    const session = await requireSession();
    const codes = await mfa.confirmEnrollment(session.user.id, parse(z.string().trim().min(6).max(10), code), await getRequestMeta());
    revalidatePath("/conta");
    return { codes };
  });
}

export async function disableMfaAction(password: string): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession();
    await mfa.disableMfa(session.user.id, parse(z.string().min(1).max(128), password), await getRequestMeta());
    revalidatePath("/conta");
    return undefined;
  });
}

export async function regenerateRecoveryAction(password: string): Promise<ActionState<{ codes: string[] }>> {
  return runAction(async () => {
    const session = await requireSession();
    const codes = await mfa.regenerateRecoveryCodes(session.user.id, parse(z.string().min(1).max(128), password), await getRequestMeta());
    revalidatePath("/conta");
    return { codes };
  });
}
