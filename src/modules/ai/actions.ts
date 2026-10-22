"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { askAboutCase, setOrgAiEnabled, type AiAnswer } from "@/server/services/ai.service";
import { draftPiece, researchJurisprudence, saveDraftAsDocument, summarizeConversation } from "@/server/services/ai-tools.service";
import { requireTenant } from "@/server/session";

export async function askCaseAction(caseId: string, question: string): Promise<ActionState<AiAnswer>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return askAboutCase(ctx, parse(uuidSchema, caseId), parse(z.string(), question));
  });
}

export async function setAiEnabledAction(enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setOrgAiEnabled(ctx, parse(z.boolean(), enabled));
    revalidatePath("/ia");
    return undefined;
  });
}

export async function researchJurisprudenceAction(input: { question: string; caseId?: string }): Promise<ActionState<{ answer: string; removedCitations: number; warning: string; tokens: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return researchJurisprudence(ctx, { question: parse(z.string(), input.question), caseId: input.caseId ? parse(uuidSchema, input.caseId) : null });
  });
}

export async function draftPieceAction(caseId: string, input: { kind: string; instructions: string }): Promise<ActionState<{ text: string; tokens: number; banner: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return draftPiece(ctx, parse(uuidSchema, caseId), { kind: parse(z.enum(["peticao_inicial", "contestacao", "replica", "recurso", "embargos_declaracao", "manifestacao", "outra"]), input.kind), instructions: parse(z.string(), input.instructions) });
  });
}

export async function saveDraftDocumentAction(caseId: string, input: { title: string; text: string }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await saveDraftAsDocument(ctx, parse(uuidSchema, caseId), { title: parse(z.string(), input.title), text: parse(z.string().max(60_000), input.text) });
    revalidatePath(`/processos/${caseId}`);
    return r;
  });
}

export async function summarizeConversationAction(conversationId: string): Promise<ActionState<{ summary: string; messages: number; tokens: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return summarizeConversation(ctx, parse(uuidSchema, conversationId));
  });
}
