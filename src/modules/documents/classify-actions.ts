"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { decideClassification, suggestClassification, suggestForUncategorized } from "@/server/services/doc-classify.service";
import { requireTenant } from "@/server/session";

const touch = (documentId?: string) => {
  revalidatePath("/documentos/classificar");
  revalidatePath("/documentos");
  if (documentId) revalidatePath(`/documentos/${documentId}`);
};

export async function suggestClassificationAction(documentId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await suggestClassification(ctx, parse(uuidSchema, documentId));
    touch(documentId);
    return undefined;
  });
}

export async function suggestBatchAction(): Promise<ActionState<{ suggested: number; skipped: number; stoppedBecause: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await suggestForUncategorized(ctx);
    touch();
    return r;
  });
}

const decisionSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("accept") }), z.object({ action: z.literal("correct"), category: z.string().max(40) }), z.object({ action: z.literal("dismiss") })]);

export async function decideClassificationAction(id: string, documentId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await decideClassification(ctx, parse(uuidSchema, id), parse(decisionSchema, input));
    touch(documentId);
    return undefined;
  });
}
