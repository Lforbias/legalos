"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { cancelSubscription, contractPlan, refreshBilling, saveBillingProfile } from "@/server/services/billing.service";
import { requireTenant } from "@/server/session";

const profileSchema = z.object({ name: z.string().max(200), document: z.string().max(40), email: z.string().max(200) });

export async function saveBillingProfileAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveBillingProfile(ctx, parse(profileSchema, input));
    revalidatePath("/configuracoes");
    return undefined;
  });
}
export async function contractPlanAction(planKey: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await contractPlan(ctx, parse(z.string().min(1).max(60), planKey));
    revalidatePath("/configuracoes");
    return undefined;
  });
}
export async function cancelSubscriptionAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await cancelSubscription(ctx);
    revalidatePath("/configuracoes");
    return undefined;
  });
}
export async function refreshBillingAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await refreshBilling(ctx);
    revalidatePath("/configuracoes");
    return undefined;
  });
}
