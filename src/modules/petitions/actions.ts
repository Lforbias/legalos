"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { addAttachment, approvePetition, cancelPetition, createPetition, moveAttachment, reconcilePetition, removeAttachment, requestReview, returnPetition, setAttachmentClassification, submitPetition, updatePetition } from "@/server/services/petition.service";
import { z } from "zod";
import { attachmentSchema, petitionSchema, reconcileFiledSchema, reconcileNotFiledSchema, returnSchema } from "./schemas";

const touch = (id?: string, caseId?: string) => {
  revalidatePath("/peticoes");
  if (id) revalidatePath(`/peticoes/${id}`);
  if (caseId) revalidatePath(`/processos/${caseId}`);
};

export async function createPetitionAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const p = await createPetition(ctx, parse(petitionSchema, input));
    touch(undefined, p.caseId);
    return { id: p.id };
  });
}

export async function updatePetitionAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updatePetition(ctx, parse(uuidSchema, id), parse(petitionSchema, input));
    touch(id);
    return undefined;
  });
}

async function run(id: string, fn: (ctx: Awaited<ReturnType<typeof requireTenant>>["ctx"], id: string) => Promise<unknown>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await fn(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}

export async function requestReviewAction(id: string): Promise<ActionState> {
  return run(id, requestReview);
}
export async function approvePetitionAction(id: string): Promise<ActionState> {
  return run(id, approvePetition);
}
export async function cancelPetitionAction(id: string): Promise<ActionState> {
  return run(id, cancelPetition);
}

export async function returnPetitionAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await returnPetition(ctx, parse(uuidSchema, id), parse(returnSchema, input).note);
    touch(id);
    return undefined;
  });
}

export async function submitPetitionAction(id: string, confirmCase?: string): Promise<ActionState<{ protocol: string; isDemo: boolean; status: string; environment: string; officiallyFiled: boolean }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const res = await submitPetition(ctx, parse(uuidSchema, id), { confirmCase: confirmCase ? parse(z.string().max(40), confirmCase) : undefined });
    touch(id);
    return res;
  });
}

export async function addAttachmentAction(petitionId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addAttachment(ctx, parse(uuidSchema, petitionId), parse(attachmentSchema, input));
    touch(petitionId);
    return undefined;
  });
}

export async function removeAttachmentAction(petitionId: string, attachmentId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeAttachment(ctx, parse(uuidSchema, petitionId), parse(uuidSchema, attachmentId));
    touch(petitionId);
    return undefined;
  });
}

export async function classifyAttachmentAction(petitionId: string, attachmentId: string, classification: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const cls = parse(attachmentSchema.shape.classification, classification);
    await setAttachmentClassification(ctx, parse(uuidSchema, petitionId), parse(uuidSchema, attachmentId), cls);
    touch(petitionId);
    return undefined;
  });
}

export async function moveAttachmentAction(petitionId: string, attachmentId: string, direction: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await moveAttachment(ctx, parse(uuidSchema, petitionId), parse(uuidSchema, attachmentId), parse(z.enum(["up", "down"]), direction));
    touch(petitionId);
    return undefined;
  });
}

/** Conferência no tribunal: protocolo + recibo (documento do processo). Só quem pode aprovar petições. */
export async function reconcileFiledAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(reconcileFiledSchema, input);
    await reconcilePetition(ctx, parse(uuidSchema, id), { outcome: "FILED", protocol: v.protocol, receiptDocumentId: v.receiptDocumentId, note: v.note ?? null });
    touch(id);
    return undefined;
  });
}

export async function reconcileNotFiledAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await reconcilePetition(ctx, parse(uuidSchema, id), { outcome: "NOT_FILED", note: parse(reconcileNotFiledSchema, input).note });
    touch(id);
    return undefined;
  });
}
