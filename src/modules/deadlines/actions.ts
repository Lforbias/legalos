"use server";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { calculateAuxiliary, cancelDeadline, createDeadline, fulfillDeadline, updateDeadline, validateDeadline } from "@/server/services/deadline.service";
import { calcSchema, deadlineSchema } from "./schemas";

const touch = (id?: string, caseId?: string) => {
  revalidatePath("/prazos");
  revalidatePath("/agenda");
  revalidatePath("/");
  if (id) revalidatePath(`/prazos/${id}`);
  if (caseId) revalidatePath(`/processos/${caseId}`);
};

export async function createDeadlineAction(input: unknown, noticeId?: string): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const d = await createDeadline(ctx, parse(deadlineSchema, input), { surface: boxV3PreviewEnabled() ? "v3" : "legacy", sourceNoticeId: noticeId ? parse(uuidSchema, noticeId) : undefined });
    touch(undefined, d.caseId);
    return { id: d.id };
  });
}

export async function updateDeadlineAction(id: string, input: unknown): Promise<ActionState<{ revalidate: boolean }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await updateDeadline(ctx, parse(uuidSchema, id), parse(deadlineSchema, input));
    touch(id);
    return r;
  });
}

export async function validateDeadlineAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await validateDeadline(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}

export async function fulfillDeadlineAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await fulfillDeadline(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}

export async function cancelDeadlineAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await cancelDeadline(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}

export async function calculateDeadlineAction(input: unknown): Promise<ActionState<{ dueDate: string; note: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = calculateAuxiliary(ctx, parse(calcSchema, input));
    return { dueDate: r.dueDate, note: r.note };
  });
}
