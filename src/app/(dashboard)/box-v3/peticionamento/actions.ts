"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotFoundError } from "@/lib/permissions/check";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { runAction, parse } from "@/server/action-helpers";
import { uuidSchema } from "@/lib/validation/common";
import { reconcileFiledSchema, reconcileNotFiledSchema } from "@/modules/petitions/schemas";
import { reconcilePetition } from "@/server/services/petition.service";
import { addBoxV3PetitionDraftAttachment, approveBoxV3Petition, cancelBoxV3PetitionAndCopyDraft, createBoxV3PetitionDraft, removeBoxV3PetitionDraftAttachment, requestBoxV3PetitionReview, returnBoxV3PetitionToDraft, updateBoxV3PetitionDraft } from "@/server/judicial/box-v3.service";

async function requireBoxV3Tenant() {
  if (!boxV3PreviewEnabled()) throw new NotFoundError("Prévia do Box 3.0 indisponível.");
  return requireTenant();
}

export async function createBoxV3PetitionDraftAction(formData: FormData) {
  const caseId = formData.get("caseId");
  const documentId = formData.get("documentId");
  const title = formData.get("title");
  const kind = formData.get("kind");
  if (typeof caseId !== "string" || typeof documentId !== "string" || typeof title !== "string" || typeof kind !== "string") throw new NotFoundError("Confira os dados do rascunho.");
  const { ctx } = await requireBoxV3Tenant();
  const id = await createBoxV3PetitionDraft(ctx, { caseId, documentId, title, kind });
  revalidatePath("/box-v3/peticionamento");
  redirect(`/box-v3/peticionamento/${id}`);
}

export async function updateBoxV3PetitionDraftAction(formData: FormData) {
  const id = formData.get("id");
  const documentId = formData.get("documentId");
  const title = formData.get("title");
  const kind = formData.get("kind");
  if (typeof id !== "string" || typeof documentId !== "string" || typeof title !== "string" || typeof kind !== "string") throw new NotFoundError("Confira os dados do rascunho.");
  const { ctx } = await requireBoxV3Tenant();
  await updateBoxV3PetitionDraft(ctx, id, { documentId, title, kind });
  revalidatePath("/box-v3/peticionamento");
  revalidatePath(`/box-v3/peticionamento/${id}`);
  redirect(`/box-v3/peticionamento/${id}`);
}

export async function addBoxV3PetitionDraftAttachmentAction(formData: FormData) {
  const petitionId = formData.get("petitionId");
  const documentId = formData.get("documentId");
  const classification = formData.get("classification");
  if (typeof petitionId !== "string" || typeof documentId !== "string" || typeof classification !== "string") throw new NotFoundError("Confira os dados do anexo.");
  const { ctx } = await requireBoxV3Tenant();
  await addBoxV3PetitionDraftAttachment(ctx, petitionId, documentId, classification);
  revalidatePath(`/box-v3/peticionamento/${petitionId}`);
  redirect(`/box-v3/peticionamento/${petitionId}`);
}

export async function removeBoxV3PetitionDraftAttachmentAction(formData: FormData) {
  const petitionId = formData.get("petitionId");
  const attachmentId = formData.get("attachmentId");
  if (typeof petitionId !== "string" || typeof attachmentId !== "string") throw new NotFoundError("Anexo não encontrado.");
  const { ctx } = await requireBoxV3Tenant();
  await removeBoxV3PetitionDraftAttachment(ctx, petitionId, attachmentId);
  revalidatePath(`/box-v3/peticionamento/${petitionId}`);
  redirect(`/box-v3/peticionamento/${petitionId}`);
}

export async function requestBoxV3PetitionReviewAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") throw new NotFoundError("Rascunho não encontrado.");
  const { ctx } = await requireBoxV3Tenant();
  await requestBoxV3PetitionReview(ctx, id);
  revalidatePath("/box-v3/peticionamento");
  revalidatePath(`/box-v3/peticionamento/${id}`);
  redirect(`/box-v3/peticionamento/${id}`);
}

export async function approveBoxV3PetitionAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") throw new NotFoundError("Petição não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await approveBoxV3Petition(ctx, id);
  revalidatePath("/box-v3/peticionamento");
  revalidatePath(`/box-v3/peticionamento/${id}`);
  redirect(`/box-v3/peticionamento/${id}`);
}

export async function returnBoxV3PetitionToDraftAction(formData: FormData) {
  const id = formData.get("id");
  const note = formData.get("note");
  if (typeof id !== "string" || typeof note !== "string") throw new NotFoundError("Confira os dados da devolução.");
  const { ctx } = await requireBoxV3Tenant();
  await returnBoxV3PetitionToDraft(ctx, id, note);
  revalidatePath("/box-v3/peticionamento");
  revalidatePath(`/box-v3/peticionamento/${id}`);
  redirect(`/box-v3/peticionamento/${id}`);
}

export async function cancelBoxV3PetitionAndCopyDraftAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") throw new NotFoundError("Petição não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  const draftId = await cancelBoxV3PetitionAndCopyDraft(ctx, id);
  revalidatePath("/box-v3/peticionamento");
  revalidatePath(`/box-v3/peticionamento/${id}`);
  redirect(`/box-v3/peticionamento/${draftId}`);
}

/** Registra uma conferência humana feita no portal do tribunal; não acessa nem envia nada ao tribunal. */
export async function reconcileBoxV3PetitionFiledAction(id: string, input: unknown) {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    const value = parse(reconcileFiledSchema, input);
    await reconcilePetition(ctx, parse(uuidSchema, id), { outcome: "FILED", protocol: value.protocol, receiptDocumentId: value.receiptDocumentId, note: value.note ?? null }, "v3");
    revalidatePath("/box-v3/peticionamento");
    revalidatePath(`/box-v3/peticionamento/${id}`);
    return undefined;
  });
}

/** Registra a conferência humana de que nada foi protocolado; não reabilita envio na V3. */
export async function reconcileBoxV3PetitionNotFiledAction(id: string, input: unknown) {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    const value = parse(reconcileNotFiledSchema, input);
    await reconcilePetition(ctx, parse(uuidSchema, id), { outcome: "NOT_FILED", note: value.note }, "v3");
    revalidatePath("/box-v3/peticionamento");
    revalidatePath(`/box-v3/peticionamento/${id}`);
    return undefined;
  });
}
