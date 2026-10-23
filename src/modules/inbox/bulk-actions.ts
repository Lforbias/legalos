"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation/common";
import { runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { bulkUpdateNotices } from "@/server/services/notice-bulk.service";

export async function bulkNoticeAction(input: unknown): Promise<ActionState<{ count: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const result = await bulkUpdateNotices(ctx, input);
    revalidatePath("/caixa-de-entrada");
    revalidatePath("/caixa-de-entrada/[id]", "page");
    revalidatePath("/box");
    revalidatePath("/");
    revalidatePath("/processos/[id]", "page");
    return result;
  });
}
