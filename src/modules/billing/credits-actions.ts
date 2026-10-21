"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { setLowThreshold } from "@/server/services/credit.service";
import { requireTenant } from "@/server/session";

export async function setLowThresholdAction(value: number): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setLowThreshold(ctx, parse(z.number().int(), value));
    revalidatePath("/configuracoes/creditos");
    return undefined;
  });
}
