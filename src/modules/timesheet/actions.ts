"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { deleteTime, logTime } from "@/server/services/team.service";
import { timeEntrySchema } from "./schemas";

export async function logTimeAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await logTime(ctx, parse(timeEntrySchema, input));
    revalidatePath("/equipe");
    return undefined;
  });
}

export async function deleteTimeAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteTime(ctx, parse(uuidSchema, id));
    revalidatePath("/equipe");
    return undefined;
  });
}
