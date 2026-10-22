"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { addLinkedDocument, removeLinkedDocument } from "@/server/services/linked-document.service";

export async function addLinkedDocumentAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ name: z.string().trim().min(2, "Informe o nome do documento.").max(200), url: z.string().trim().min(8, "Cole o link.").max(1000) }), input);
    await addLinkedDocument(ctx, { caseId: parse(uuidSchema, caseId) }, v);
    revalidatePath(`/processos/${caseId}`);
    return undefined;
  });
}

export async function removeLinkedDocumentAction(caseId: string, id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeLinkedDocument(ctx, parse(uuidSchema, id));
    revalidatePath(`/processos/${caseId}`);
    return undefined;
  });
}
