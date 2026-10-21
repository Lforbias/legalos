"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { letterheadSchema } from "./letterhead-schemas";
import { createLetterhead, deleteLetterhead, updateLetterhead } from "@/server/services/letterhead.service";

const touch = () => revalidatePath("/documentos/timbrados");

export async function createLetterheadAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await createLetterhead(ctx, parse(letterheadSchema, input));
    touch();
    return { id: r.id };
  });
}

export async function updateLetterheadAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateLetterhead(ctx, parse(uuidSchema, id), parse(letterheadSchema, input));
    touch();
    return undefined;
  });
}

export async function deleteLetterheadAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteLetterhead(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
