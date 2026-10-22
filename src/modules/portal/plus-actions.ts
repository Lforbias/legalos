"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { approvePortalUpdate, createClientPending, discardPortalUpdate, draftPortalUpdate, markMyPendingDone, replyToClient, sendMyMessage, setPendingStatus } from "@/server/services/portal-plus.service";

const text = (max: number) => z.string().max(max);

export async function draftUpdateAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ originalText: text(4000), plainText: text(2000).optional() }), input);
    await draftPortalUpdate(ctx, parse(uuidSchema, caseId), v);
    revalidatePath(`/processos/${caseId}`);
    return undefined;
  });
}
export async function approveUpdateAction(id: string, caseId: string, editedText: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await approvePortalUpdate(ctx, parse(uuidSchema, id), parse(text(2000), editedText));
    revalidatePath(`/processos/${parse(uuidSchema, caseId)}`);
    return undefined;
  });
}
export async function discardUpdateAction(id: string, caseId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await discardPortalUpdate(ctx, parse(uuidSchema, id));
    revalidatePath(`/processos/${parse(uuidSchema, caseId)}`);
    return undefined;
  });
}
export async function createPendingAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ clientId: uuidSchema, caseId: uuidSchema.nullable().optional(), title: text(160), description: text(1000).optional(), dueDate: z.string().refine((d) => d === "" || isYmd(d)).optional() }), input);
    await createClientPending(ctx, { ...v, dueDate: v.dueDate || null });
    revalidatePath(`/clientes/${v.clientId}`);
    return undefined;
  });
}
export async function setPendingStatusAction(id: string, clientId: string, status: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setPendingStatus(ctx, parse(uuidSchema, id), parse(z.enum(["DONE", "CANCELED", "OPEN"]), status));
    revalidatePath(`/clientes/${parse(uuidSchema, clientId)}`);
    return undefined;
  });
}
export async function replyClientAction(clientId: string, body: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await replyToClient(ctx, parse(uuidSchema, clientId), parse(text(3000), body));
    revalidatePath(`/portal-equipe/${clientId}`);
    return undefined;
  });
}
export async function markPendingDoneAction(id: string, note: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await markMyPendingDone(ctx, parse(uuidSchema, id), parse(text(500), note));
    revalidatePath("/portal");
    return undefined;
  });
}
export async function sendMyMessageAction(body: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await sendMyMessage(ctx, parse(text(2000), body));
    revalidatePath("/portal");
    return undefined;
  });
}
