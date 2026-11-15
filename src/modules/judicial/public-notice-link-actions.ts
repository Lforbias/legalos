"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { linkPublicDjenNoticeToCase, markPublicDjenNoticeProcessed } from "@/server/services/public-judicial.service";

export async function linkPublicDjenNoticeAction(noticeId: string, caseId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const id = parse(uuidSchema, noticeId);
    const caseKey = parse(uuidSchema, caseId);
    await linkPublicDjenNoticeToCase(ctx, id, caseKey);
    revalidatePath("/evolution/juridico/publicacoes");
    revalidatePath(`/processos/${caseKey}`);
    return undefined;
  });
}

export async function processPublicDjenNoticeAction(noticeId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await markPublicDjenNoticeProcessed(ctx, parse(uuidSchema, noticeId));
    revalidatePath("/evolution/juridico/publicacoes");
    return undefined;
  });
}
