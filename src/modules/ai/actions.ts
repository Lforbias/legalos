"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { askAboutCase, setOrgAiEnabled, type AiAnswer } from "@/server/services/ai.service";
import { requireTenant } from "@/server/session";

export async function askCaseAction(caseId: string, question: string): Promise<ActionState<AiAnswer>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return askAboutCase(ctx, parse(uuidSchema, caseId), parse(z.string(), question));
  });
}

export async function setAiEnabledAction(enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setOrgAiEnabled(ctx, parse(z.boolean(), enabled));
    revalidatePath("/ia");
    return undefined;
  });
}
