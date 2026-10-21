"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { createSnippet, deleteSnippet, updateSnippet } from "@/server/services/snippet.service";
import { requireTenant } from "@/server/session";
import { snippetSchema } from "./schemas";

export async function createSnippetAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const s = await createSnippet(ctx, parse(snippetSchema, input));
    revalidatePath("/documentos/autotextos");
    return { id: s.id };
  });
}

export async function updateSnippetAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateSnippet(ctx, parse(uuidSchema, id), parse(snippetSchema, input));
    revalidatePath("/documentos/autotextos");
    revalidatePath(`/documentos/autotextos/${id}`);
    return undefined;
  });
}

export async function deleteSnippetAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteSnippet(ctx, parse(uuidSchema, id));
    revalidatePath("/documentos/autotextos");
    return undefined;
  });
}
