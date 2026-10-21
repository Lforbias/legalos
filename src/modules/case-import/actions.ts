"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { batchInputSchema, createImportBatch, processBatchStep } from "@/server/services/case-import.service";

export async function createImportBatchAction(input: unknown): Promise<ActionState<{ id: string; total: number; created: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await createImportBatch(ctx, parse(batchInputSchema, input));
    revalidatePath("/processos");
    return r;
  });
}

export async function processBatchStepAction(batchId: string): Promise<ActionState<{ remaining: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await processBatchStep(ctx, parse(uuidSchema, batchId));
    revalidatePath(`/processos/importar/${batchId}`);
    return r;
  });
}
