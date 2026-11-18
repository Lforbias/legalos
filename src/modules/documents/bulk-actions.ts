"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { BULK_MAX_FILES } from "@/lib/documents/bulk-match";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { listClientCasesForBulk, planBulkUpload, undoBulkUpload, type BulkPlan } from "@/server/services/document-bulk.service";

const planSchema = z
  .array(z.object({ path: z.string().min(1).max(1000), sha256: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int().nonnegative() }))
  .min(1)
  .max(BULK_MAX_FILES);

export async function planBulkUploadAction(files: unknown): Promise<ActionState<BulkPlan>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return planBulkUpload(ctx, parse(planSchema, files));
  });
}

export async function listClientCasesForBulkAction(clientId: string): Promise<ActionState<{ id: string; number: string | null; title: string }[]>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return listClientCasesForBulk(ctx, parse(uuidSchema, clientId));
  });
}

export async function undoBulkUploadAction(ids: unknown): Promise<ActionState<{ removed: number; kept: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const result = await undoBulkUpload(ctx, parse(z.array(uuidSchema).max(BULK_MAX_FILES), ids));
    revalidatePath("/documentos");
    return result;
  });
}
