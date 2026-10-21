"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ValidationError } from "@/lib/permissions/check";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { setCaseAcervo } from "@/server/services/case.service";
import { addBulkNote, addCaseNoteItem, addNoteAttachment, deleteCaseNote, deleteNoteAttachment, setNotePinned, updateCaseNote } from "@/server/services/case-note.service";
import { createCustomField, setCaseCustomFields, setCustomFieldActive } from "@/server/services/custom-field.service";
import { createRegistryParty, deleteRegistryParty, updateRegistryParty } from "@/server/services/party-registry.service";
import { bulkNoteSchema, caseNoteSchema, customFieldDefSchema, customValuesSchema } from "./extras-schemas";
import { registrySchema } from "@/modules/registry/schemas";

const touch = (id: string) => {
  revalidatePath("/processos");
  revalidatePath(`/processos/${id}`);
};

export async function setAcervoAction(caseId: string, inAcervo: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setCaseAcervo(ctx, parse(uuidSchema, caseId), parse(z.boolean(), inAcervo));
    touch(caseId);
    return undefined;
  });
}

export async function addCaseNoteItemAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addCaseNoteItem(ctx, parse(uuidSchema, caseId), parse(caseNoteSchema, input));
    touch(caseId);
    return undefined;
  });
}

export async function pinNoteAction(noteId: string, pinned: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    touch(await setNotePinned(ctx, parse(uuidSchema, noteId), parse(z.boolean(), pinned)));
    return undefined;
  });
}

export async function deleteNoteItemAction(noteId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    touch(await deleteCaseNote(ctx, parse(uuidSchema, noteId)));
    return undefined;
  });
}

export async function bulkNoteAction(input: unknown): Promise<ActionState<{ count: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await addBulkNote(ctx, parse(bulkNoteSchema, input));
    revalidatePath("/processos");
    return { count: r.count };
  });
}

export async function saveCustomValuesAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setCaseCustomFields(ctx, parse(uuidSchema, caseId), parse(customValuesSchema, input));
    touch(caseId);
    return undefined;
  });
}

export async function createCustomFieldAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createCustomField(ctx, parse(customFieldDefSchema, input));
    revalidatePath("/configuracoes/campos");
    return undefined;
  });
}

export async function toggleCustomFieldAction(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setCustomFieldActive(ctx, parse(uuidSchema, id), parse(z.boolean(), active));
    revalidatePath("/configuracoes/campos");
    return undefined;
  });
}

export async function createRegistryAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const row = await createRegistryParty(ctx, parse(registrySchema, input));
    revalidatePath("/partes");
    return { id: row.id };
  });
}

export async function updateRegistryAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateRegistryParty(ctx, parse(uuidSchema, id), parse(registrySchema, input));
    revalidatePath("/partes");
    return undefined;
  });
}

export async function deleteRegistryAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteRegistryParty(ctx, parse(uuidSchema, id));
    revalidatePath("/partes");
    return undefined;
  });
}

/** Busca para o seletor de partes do processo (somente leitura). */
export async function searchRegistryAction(q: string): Promise<ActionState<{ id: string; name: string; document: string | null; kind: string; profession: string | null }[]>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const { searchRegistry } = await import("@/server/services/party-registry.service");
    return searchRegistry(ctx, parse(z.string().max(80), q));
  });
}

export async function updateNoteAction(noteId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(caseNoteSchema.pick({ title: true, body: true }), input);
    touch(await updateCaseNote(ctx, parse(uuidSchema, noteId), v));
    return undefined;
  });
}

export async function addNoteAttachmentAction(noteId: string, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Escolha um arquivo.", { file: ["Escolha um arquivo."] });
    if (file.size > 8 * 1024 * 1024) throw new ValidationError("Arquivo muito grande.", { file: ["O tamanho máximo é 8 MB."] });
    touch(await addNoteAttachment(ctx, parse(uuidSchema, noteId), { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }));
    return undefined;
  });
}

export async function deleteNoteAttachmentAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    touch(await deleteNoteAttachment(ctx, parse(uuidSchema, id)));
    return undefined;
  });
}
