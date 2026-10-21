"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { deleteDocument, updateDocumentMeta } from "@/server/services/document.service";
import { extractDocumentText, extractPendingTexts, type ExtractSummary } from "@/server/services/document-text.service";
import { documentMetaSchema } from "./schemas";

export async function updateDocumentMetaAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateDocumentMeta(ctx, parse(uuidSchema, id), parse(documentMetaSchema, input));
    revalidatePath(`/documentos/${id}`);
    revalidatePath("/documentos");
    return undefined;
  });
}

export async function deleteDocumentFromRepositoryAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteDocument(ctx, parse(uuidSchema, id));
    revalidatePath("/documentos");
    return undefined;
  });
}

export async function extractDocumentTextAction(id: string): Promise<ActionState<ExtractSummary>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await extractDocumentText(ctx, parse(uuidSchema, id));
    revalidatePath(`/documentos/${id}`);
    return r;
  });
}

export async function extractPendingTextsAction(): Promise<ActionState<{ processed: number; extracted: number; failed: number; remaining: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await extractPendingTexts(ctx, 10);
    revalidatePath("/documentos");
    return r;
  });
}
