"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { schedulePetition, setScheduleSwitch, unschedulePetition } from "@/server/services/petition-queue.service";

const touch = (id?: string) => {
  revalidatePath("/peticoes");
  revalidatePath("/peticoes/fila");
  if (id) revalidatePath(`/peticoes/${id}`);
};

export async function setScheduleSwitchAction(on: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setScheduleSwitch(ctx, parse(z.boolean(), on));
    touch();
    return undefined;
  });
}

export async function schedulePetitionAction(id: string, atIso: string, confirmCase?: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const at = new Date(parse(z.string().max(40), atIso));
    await schedulePetition(ctx, parse(uuidSchema, id), { at, confirmCase: confirmCase ? parse(z.string().max(40), confirmCase) : undefined });
    touch(id);
    return undefined;
  });
}

export async function unschedulePetitionAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await unschedulePetition(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}
