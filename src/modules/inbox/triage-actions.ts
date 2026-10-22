"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { discardTriage, triageNotice, updateTriageMinuta, validateTriage } from "@/server/services/notice-triage.service";

export async function triageAction(noticeId: string, useAi: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await triageNotice(ctx, parse(uuidSchema, noticeId), { useAi: parse(z.boolean(), useAi) });
    revalidatePath(`/caixa-de-entrada/${noticeId}`);
    return undefined;
  });
}
export async function saveMinutaAction(noticeId: string, minuta: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateTriageMinuta(ctx, parse(uuidSchema, noticeId), parse(z.string().max(30_000), minuta));
    revalidatePath(`/caixa-de-entrada/${noticeId}`);
    return undefined;
  });
}
export async function validateTriageAction(noticeId: string, createDeadline: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await validateTriage(ctx, parse(uuidSchema, noticeId), { createDeadline: parse(z.boolean(), createDeadline) });
    revalidatePath(`/caixa-de-entrada/${noticeId}`);
    return undefined;
  });
}
export async function discardTriageAction(noticeId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await discardTriage(ctx, parse(uuidSchema, noticeId));
    revalidatePath(`/caixa-de-entrada/${noticeId}`);
    return undefined;
  });
}
