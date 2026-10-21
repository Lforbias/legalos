"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import {
  addCaseMember,
  addCaseNote,
  addParty,
  archiveCase,
  changeCaseStatus,
  createCase,
  removeCaseMember,
  removeParty,
  updateCase,
} from "@/server/services/case.service";
import { deleteDocument } from "@/server/services/document.service";
import { CASE_MEMBER_ROLES, CASE_STATUSES, caseSchema, createCaseSchema, noteSchema, partySchema } from "./schemas";

const touch = (id: string) => {
  revalidatePath("/processos");
  revalidatePath(`/processos/${id}`);
};

export async function createCaseAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const c = await createCase(ctx, parse(createCaseSchema, input));
    revalidatePath("/processos");
    return { id: c.id };
  });
}

export async function updateCaseAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateCase(ctx, parse(uuidSchema, id), parse(caseSchema, input));
    touch(id);
    return undefined;
  });
}

export async function changeCaseStatusAction(id: string, status: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await changeCaseStatus(ctx, parse(uuidSchema, id), parse(z.enum(CASE_STATUSES), status));
    touch(id);
    return undefined;
  });
}

export async function archiveCaseAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await archiveCase(ctx, parse(uuidSchema, id));
    revalidatePath("/processos");
    return undefined;
  });
}

export async function addPartyAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addParty(ctx, parse(uuidSchema, caseId), parse(partySchema, input));
    touch(caseId);
    return undefined;
  });
}

export async function removePartyAction(caseId: string, partyId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeParty(ctx, parse(uuidSchema, caseId), parse(uuidSchema, partyId));
    touch(caseId);
    return undefined;
  });
}

export async function addMemberAction(caseId: string, userId: string, role: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addCaseMember(ctx, parse(uuidSchema, caseId), parse(uuidSchema, userId), parse(z.enum(CASE_MEMBER_ROLES), role));
    touch(caseId);
    return undefined;
  });
}

export async function removeMemberAction(caseId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeCaseMember(ctx, parse(uuidSchema, caseId), parse(uuidSchema, userId));
    touch(caseId);
    return undefined;
  });
}

export async function addNoteAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addCaseNote(ctx, parse(uuidSchema, caseId), parse(noteSchema, input));
    touch(caseId);
    return undefined;
  });
}

export async function deleteDocumentAction(documentId: string, revalidate: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteDocument(ctx, parse(uuidSchema, documentId));
    // só revalida caminhos internos conhecidos
    if (/^\/(processos|clientes)\/[0-9a-f-]{36}$/.test(revalidate)) revalidatePath(revalidate);
    return undefined;
  });
}
