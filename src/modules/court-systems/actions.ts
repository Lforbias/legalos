"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { setCourtSystem } from "@/server/services/court-system-map.service";
import { requireTenant } from "@/server/session";

const schema = z.object({ jtr: z.string().regex(/^\d\.\d{2}$/), system: z.string().max(40).nullable() });

export async function setCourtSystemAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(schema, input);
    await setCourtSystem(ctx, v.jtr, v.system || null);
    revalidatePath("/configuracoes/tribunais");
    return undefined;
  });
}
