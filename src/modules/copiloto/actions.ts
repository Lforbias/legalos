"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { analyzeSession, approveSession, createSession, deleteSession } from "@/server/services/service-session.service";

const optUuid = z.union([uuidSchema, z.literal("")]).optional();

export async function createSessionAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ title: z.string().max(160), transcript: z.string().max(40_000), clientId: optUuid, caseId: optUuid }), input);
    const r = await createSession(ctx, v);
    revalidatePath("/copiloto");
    return { id: r.id };
  });
}
export async function analyzeSessionAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await analyzeSession(ctx, parse(uuidSchema, id));
    revalidatePath(`/copiloto/${id}`);
    return undefined;
  });
}
export async function approveSessionAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ taskIndexes: z.array(z.number().int().min(0).max(50)).max(50), assigneeId: optUuid, summary: z.string().max(4000).optional() }), input);
    await approveSession(ctx, parse(uuidSchema, id), v);
    revalidatePath(`/copiloto/${id}`);
    return undefined;
  });
}
export async function deleteSessionAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteSession(ctx, parse(uuidSchema, id));
    revalidatePath("/copiloto");
    return undefined;
  });
}
