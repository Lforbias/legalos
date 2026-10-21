"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { analyzeText, assignNotice, createNotice, deleteNotice, discardNotice, linkNoticeCase, markProcessed, reopenNotice } from "@/server/services/notice.service";
import { assignSchema, discardSchema, noticeSchema, parseSchema } from "./schemas";
import type { ParsedNotice } from "@/lib/notices/parse";

const touch = (id?: string) => {
  revalidatePath("/caixa-de-entrada");
  revalidatePath("/");
  if (id) revalidatePath(`/caixa-de-entrada/${id}`);
};

export async function analyzeTextAction(input: unknown): Promise<ActionState<ParsedNotice>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return analyzeText(ctx, parse(parseSchema, input).text);
  });
}

export async function createNoticeAction(input: unknown): Promise<ActionState<{ id: string; autoLinked: boolean; duplicate: boolean }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const n = await createNotice(ctx, parse(noticeSchema, input));
    touch();
    return { id: n.id, autoLinked: n.autoLinked, duplicate: n.duplicate };
  });
}

export async function assignNoticeAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await assignNotice(ctx, parse(uuidSchema, id), parse(assignSchema, input));
    touch(id);
    return undefined;
  });
}

export async function linkNoticeCaseAction(id: string, caseId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await linkNoticeCase(ctx, parse(uuidSchema, id), caseId ? parse(uuidSchema, caseId) : null);
    touch(id);
    return undefined;
  });
}

export async function processNoticeAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await markProcessed(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}

export async function discardNoticeAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await discardNotice(ctx, parse(uuidSchema, id), parse(discardSchema, input));
    touch(id);
    return undefined;
  });
}

export async function reopenNoticeAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await reopenNotice(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}

export async function deleteNoticeAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteNotice(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
