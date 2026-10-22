"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { applyDistribution, deleteGoal, setGoal } from "@/server/services/goals.service";

export async function setGoalAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ userId: z.union([uuidSchema, z.literal("")]).optional(), month: z.string().max(7), metric: z.string().max(20), target: z.coerce.number() }), input);
    await setGoal(ctx, { ...v, userId: v.userId || null });
    revalidatePath("/equipe/metas");
    return undefined;
  });
}
export async function deleteGoalAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteGoal(ctx, parse(uuidSchema, id));
    revalidatePath("/equipe/metas");
    return undefined;
  });
}
export async function applyDistributionAction(items: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await applyDistribution(ctx, parse(z.array(z.object({ taskId: uuidSchema, userId: uuidSchema })).max(100), items));
    revalidatePath("/equipe/metas");
    revalidatePath("/equipe");
    return undefined;
  });
}
