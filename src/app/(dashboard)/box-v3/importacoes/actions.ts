"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError } from "@/lib/permissions/check";
import { type ActionState } from "@/lib/validation/common";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { batchInputSchema, createImportBatch } from "@/server/services/case-import.service";

export async function createBoxV3ImportBatchAction(input: unknown): Promise<ActionState<{ id: string; total: number; created: number }>> {
  return runAction(async () => {
    if (!boxV3PreviewEnabled()) throw new NotFoundError("Prévia do Box 3.0 indisponível.");
    const { ctx } = await requireTenant();
    const parsed = parse(batchInputSchema, input);
    const result = await createImportBatch(ctx, { ...parsed, datajud: false, autos: false, updateExisting: false });
    revalidatePath("/box-v3/importacoes");
    revalidatePath("/processos");
    return result;
  });
}
