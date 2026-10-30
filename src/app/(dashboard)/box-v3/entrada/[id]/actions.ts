"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { discardTriage, triageNotice, updateTriageMinuta, validateTriage } from "@/server/services/notice-triage.service";
import { addBoxV3NoticeNote, assignBoxV3Notice, assignBoxV3NoticeToTeam, linkBoxV3NoticeCase, markBoxV3NoticeViewed, sendBoxV3NoticeToInbox, setBoxV3NoticeDocument, setBoxV3NoticeProcessed, setBoxV3NoticeSnooze, setBoxV3NoticeTags } from "@/server/judicial/box-v3.service";

async function requireBoxV3Tenant() {
  if (!boxV3PreviewEnabled()) throw new NotFoundError("Prévia do Box 3.0 indisponível.");
  return requireTenant();
}

export async function runBoxV3NoticeTriageAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    await triageNotice(ctx, parse(uuidSchema, id), { useAi: false }, "v3");
    revalidatePath(`/box-v3/entrada/${id}`);
    return undefined;
  });
}

export async function saveBoxV3NoticeDraftAction(id: string, minuta: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    await updateTriageMinuta(ctx, parse(uuidSchema, id), parse(z.string().max(30_000), minuta), "v3");
    revalidatePath(`/box-v3/entrada/${id}`);
    return undefined;
  });
}

export async function validateBoxV3NoticeTriageAction(id: string, createDeadline: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    await validateTriage(ctx, parse(uuidSchema, id), { createDeadline: parse(z.boolean(), createDeadline) }, "v3");
    revalidatePath(`/box-v3/entrada/${id}`);
    revalidatePath("/prazos");
    return undefined;
  });
}

export async function discardBoxV3NoticeTriageAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireBoxV3Tenant();
    await discardTriage(ctx, parse(uuidSchema, id), "v3");
    revalidatePath(`/box-v3/entrada/${id}`);
    return undefined;
  });
}

export async function markBoxV3NoticeViewedAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await markBoxV3NoticeViewed(ctx, id);
  revalidatePath(`/box-v3/entrada/${id}`);
  redirect(`/box-v3/entrada/${id}`);
}

export async function assignBoxV3NoticeAction(formData: FormData) {
  const id = formData.get("id");
  const userId = formData.get("userId");
  if (typeof id !== "string" || typeof userId !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await assignBoxV3Notice(ctx, id, userId);
  revalidatePath(`/box-v3/entrada/${id}`);
  revalidatePath("/box-v3/entrada");
  redirect(`/box-v3/entrada/${id}`);
}

export async function assignBoxV3NoticeToTeamAction(formData: FormData) {
  const id = formData.get("id");
  const teamId = formData.get("teamId");
  if (typeof id !== "string" || typeof teamId !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await assignBoxV3NoticeToTeam(ctx, id, teamId);
  revalidatePath(`/box-v3/entrada/${id}`);
  revalidatePath("/box-v3/entrada");
  redirect(`/box-v3/entrada/${id}`);
}

export async function linkBoxV3NoticeCaseAction(formData: FormData) {
  const id = formData.get("id");
  const caseId = formData.get("caseId");
  if (typeof id !== "string" || typeof caseId !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await linkBoxV3NoticeCase(ctx, id, caseId || null);
  revalidatePath(`/box-v3/entrada/${id}`);
  revalidatePath("/box-v3/entrada");
  redirect(`/box-v3/entrada/${id}`);
}

export async function setBoxV3NoticeDocumentAction(formData: FormData) {
  const id = formData.get("id");
  const documentId = formData.get("documentId");
  if (typeof id !== "string" || typeof documentId !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await setBoxV3NoticeDocument(ctx, id, documentId || null);
  revalidatePath(`/box-v3/entrada/${id}`);
  revalidatePath("/box-v3/entrada");
  redirect(`/box-v3/entrada/${id}`);
}

export async function addBoxV3NoticeNoteAction(formData: FormData) {
  const id = formData.get("id");
  const body = formData.get("body");
  if (typeof id !== "string" || typeof body !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await addBoxV3NoticeNote(ctx, id, body);
  revalidatePath(`/box-v3/entrada/${id}`);
  redirect(`/box-v3/entrada/${id}`);
}

export async function setBoxV3NoticeProcessedAction(formData: FormData) {
  const id = formData.get("id");
  const processed = formData.get("processed");
  if (typeof id !== "string" || (processed !== "true" && processed !== "false")) throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await setBoxV3NoticeProcessed(ctx, id, processed === "true");
  revalidatePath(`/box-v3/entrada/${id}`);
  revalidatePath("/box-v3/entrada");
  redirect(`/box-v3/entrada/${id}`);
}

export async function setBoxV3NoticeSnoozeAction(formData: FormData) {
  const id = formData.get("id");
  const until = formData.get("until");
  if (typeof id !== "string" || typeof until !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await setBoxV3NoticeSnooze(ctx, id, until || null);
  revalidatePath(`/box-v3/entrada/${id}`);
  revalidatePath("/box-v3/entrada");
  redirect(`/box-v3/entrada/${id}`);
}

export async function sendBoxV3NoticeToInboxAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await sendBoxV3NoticeToInbox(ctx, id);
  revalidatePath(`/box-v3/entrada/${id}`);
  revalidatePath("/box-v3/entrada");
  redirect(`/box-v3/entrada/${id}`);
}

export async function setBoxV3NoticeTagsAction(formData: FormData) {
  const id = formData.get("id");
  const tags = formData.get("tags");
  if (typeof id !== "string" || typeof tags !== "string") throw new NotFoundError("Comunicação não encontrada.");
  const { ctx } = await requireBoxV3Tenant();
  await setBoxV3NoticeTags(ctx, id, tags);
  revalidatePath(`/box-v3/entrada/${id}`);
  revalidatePath("/box-v3/entrada");
  redirect(`/box-v3/entrada/${id}`);
}
