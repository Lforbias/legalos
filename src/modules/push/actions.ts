"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { saveOrgPush, savePrefs, sendTest, subscribe, unsubscribe } from "@/server/services/push.service";

export async function subscribePushAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await subscribe(ctx, input, (await headers()).get("user-agent"));
    revalidatePath("/conta");
    return undefined;
  });
}

export async function unsubscribePushAction(endpoint: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await unsubscribe(ctx, parse(z.string().max(1000), endpoint));
    revalidatePath("/conta");
    return undefined;
  });
}

export async function savePushPrefsAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await savePrefs(ctx, input);
    revalidatePath("/conta");
    return undefined;
  });
}

export async function saveOrgPushAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveOrgPush(ctx, input);
    revalidatePath("/conta");
    return undefined;
  });
}

export async function sendPushTestAction(): Promise<ActionState<{ sent: number; failed: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return sendTest(ctx);
  });
}
