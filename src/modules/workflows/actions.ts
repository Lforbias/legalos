"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { createRule, deleteRule, setRuleActive, updateRule } from "@/server/services/workflow.service";
import { ruleSchema } from "./schemas";

const touch = () => revalidatePath("/automacoes");

export async function createRuleAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await createRule(ctx, parse(ruleSchema, input));
    touch();
    return { id: r.id };
  });
}
export async function updateRuleAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateRule(ctx, parse(uuidSchema, id), parse(ruleSchema, input));
    touch();
    return undefined;
  });
}
export async function setRuleActiveAction(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setRuleActive(ctx, parse(uuidSchema, id), parse(z.boolean(), active));
    touch();
    return undefined;
  });
}
export async function deleteRuleAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteRule(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
