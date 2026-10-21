"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { setOrgDatajudEnabled, syncCaseFromDatajud, type DatajudSyncResult } from "@/server/services/datajud.service";
import { requireTenant } from "@/server/session";

export async function syncDatajudAction(caseId: string): Promise<ActionState<DatajudSyncResult>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const id = parse(uuidSchema, caseId);
    const r = await syncCaseFromDatajud(ctx, id);
    revalidatePath(`/processos/${id}`);
    return r;
  });
}

export async function setDatajudEnabledAction(enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setOrgDatajudEnabled(ctx, parse(z.boolean(), enabled));
    revalidatePath("/integracoes");
    return undefined;
  });
}
