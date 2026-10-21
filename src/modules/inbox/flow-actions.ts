"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { addNoticeNote, assignNoticeToTeam, createTeam, deleteNoticeNote, deleteTeam, returnNotice, sendToEntrada, setNoticeTags, setTeamMembers, snoozeNotice } from "@/server/services/inbox-flow.service";
import { suggestForNotice, type NoticeSuggestion } from "@/server/services/notice-desk.service";
import { requireTenant } from "@/server/session";

const touch = (id?: string) => {
  revalidatePath("/caixa-de-entrada");
  revalidatePath("/");
  if (id) revalidatePath(`/caixa-de-entrada/${id}`);
};

export async function assignTeamAction(id: string, teamId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await assignNoticeToTeam(ctx, parse(uuidSchema, id), parse(uuidSchema, teamId));
    touch(id);
    return undefined;
  });
}
export async function returnNoticeAction(id: string): Promise<ActionState<{ toEntrada: boolean }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await returnNotice(ctx, parse(uuidSchema, id));
    touch(id);
    return r;
  });
}
export async function toEntradaAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await sendToEntrada(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}
export async function snoozeAction(id: string, until: string | null): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await snoozeNotice(ctx, parse(uuidSchema, id), until === null ? null : parse(z.string().max(10), until));
    touch(id);
    return undefined;
  });
}
export async function tagsAction(id: string, tags: string[]): Promise<ActionState<string[]>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await setNoticeTags(ctx, parse(uuidSchema, id), parse(z.array(z.string().max(60)).max(30), tags));
    touch(id);
    return r;
  });
}
export async function addNoteAction(id: string, body: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addNoticeNote(ctx, parse(uuidSchema, id), parse(z.string().max(4000), body));
    touch(id);
    return undefined;
  });
}
export async function deleteNoteAction(id: string, noteId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteNoticeNote(ctx, parse(uuidSchema, id), parse(uuidSchema, noteId));
    touch(id);
    return undefined;
  });
}
export async function createTeamAction(input: { name: string; memberIds: string[] }): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createTeam(ctx, parse(z.object({ name: z.string().max(100), memberIds: z.array(uuidSchema).max(200) }), input));
    revalidatePath("/caixa-de-entrada/equipes");
    return undefined;
  });
}
export async function setTeamMembersAction(teamId: string, memberIds: string[]): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setTeamMembers(ctx, parse(uuidSchema, teamId), parse(z.array(uuidSchema).max(200), memberIds));
    revalidatePath("/caixa-de-entrada/equipes");
    return undefined;
  });
}
export async function deleteTeamAction(teamId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteTeam(ctx, parse(uuidSchema, teamId));
    revalidatePath("/caixa-de-entrada/equipes");
    revalidatePath("/caixa-de-entrada");
    return undefined;
  });
}

export async function suggestNoticeAction(id: string): Promise<ActionState<NoticeSuggestion & { tokens: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return suggestForNotice(ctx, parse(uuidSchema, id));
  });
}
