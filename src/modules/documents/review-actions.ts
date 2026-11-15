"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/validation/common";
import { runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { decideDocumentReview, requestDocumentReview } from "@/server/services/document-review.service";

export async function requestReviewAction(documentId: string, version: number) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await requestDocumentReview(ctx, uuidSchema.parse(documentId), z.number().int().positive().parse(version));
    revalidatePath("/evolution/juridico");
    revalidatePath(`/documentos/${documentId}`);
  });
}
export async function decideReviewAction(reviewId: string, decision: string, note: string) {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await decideDocumentReview(ctx, uuidSchema.parse(reviewId), z.enum(["APPROVED", "CHANGES_REQUESTED"]).parse(decision), z.string().max(2000).parse(note));
    revalidatePath("/evolution/juridico");
    revalidatePath("/documentos/[id]", "page");
  });
}
