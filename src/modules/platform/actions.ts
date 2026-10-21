"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requirePlatform } from "@/server/platform";
import { grantCredits, setOrganizationCreditsEnabled } from "@/server/services/credit.service";
import { setOrganizationSubscription, updatePlan, setOrganizationSuspended, setUserDisabled, unlockUser } from "@/server/services/platform.service";

export async function suspendOrganizationAction(orgId: string, reason: string): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await setOrganizationSuspended(pc, parse(uuidSchema, orgId), parse(z.string().max(400), reason));
    revalidatePath("/admin/escritorios");
    revalidatePath("/admin");
    return undefined;
  });
}
export async function reactivateOrganizationAction(orgId: string): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await setOrganizationSuspended(pc, parse(uuidSchema, orgId), null);
    revalidatePath("/admin/escritorios");
    revalidatePath("/admin");
    return undefined;
  });
}
export async function setUserDisabledAction(userId: string, disabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await setUserDisabled(pc, parse(uuidSchema, userId), parse(z.boolean(), disabled));
    revalidatePath("/admin/usuarios");
    return undefined;
  });
}
export async function unlockUserAction(userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await unlockUser(pc, parse(uuidSchema, userId));
    revalidatePath("/admin/usuarios");
    return undefined;
  });
}

const subscriptionSchema = z.object({
  planKey: z.string().min(1).max(40),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"]),
  trialDays: z.number().int().nullable().optional(),
  periodDays: z.number().int().nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});
export async function setSubscriptionAction(orgId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await setOrganizationSubscription(pc, parse(uuidSchema, orgId), parse(subscriptionSchema, input));
    revalidatePath("/admin/escritorios");
    return undefined;
  });
}

const planEditSchema = z.object({
  priceCents: z.number().nullable(),
  maxUsers: z.number().nullable(),
  maxStorageMb: z.number().nullable(),
  maxAiTokensMonth: z.number().nullable(),
});
export async function updatePlanAction(key: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await updatePlan(pc, parse(z.string().min(1).max(60), key), parse(planEditSchema, input));
    revalidatePath("/admin/planos");
    revalidatePath("/configuracoes");
    return undefined;
  });
}

export async function setCreditsEnabledAction(orgId: string, enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await setOrganizationCreditsEnabled(pc, parse(uuidSchema, orgId), parse(z.boolean(), enabled));
    revalidatePath("/admin/escritorios");
    return undefined;
  });
}

const grantSchema = z.object({ amount: z.number().int(), expiresInDays: z.number().int().nullable().optional(), note: z.string().max(200).nullable().optional() });
export async function grantCreditsAction(orgId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await grantCredits(pc, parse(uuidSchema, orgId), parse(grantSchema, input));
    revalidatePath("/admin/escritorios");
    return undefined;
  });
}
