"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { deleteClientCredential, revealClientCredential, saveClientCredential } from "@/server/services/client-vault.service";
import { createRoleFromTemplate } from "@/server/services/role.service";

export async function saveCredentialAction(clientId: string, id: string | null, input: { system: string; label: string; login: string; password: string; notes?: string }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await saveClientCredential(ctx, parse(uuidSchema, clientId), id ? parse(uuidSchema, id) : null, input);
    revalidatePath(`/clientes/${clientId}`);
    return r;
  });
}

export async function deleteCredentialAction(clientId: string, id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteClientCredential(ctx, parse(uuidSchema, id));
    revalidatePath(`/clientes/${clientId}`);
    return undefined;
  });
}

/** A senha volta UMA vez, só para a tela de quem digitou o código; não é gravada em lugar nenhum. */
export async function revealCredentialAction(clientId: string, id: string, code: string): Promise<ActionState<{ login: string; password: string; notes: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await revealClientCredential(ctx, parse(uuidSchema, id), parse(z.string().max(30), code));
    revalidatePath(`/clientes/${clientId}`);
    return { login: r.login, password: r.password, notes: r.notes };
  });
}

export async function createRoleFromTemplateAction(key: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createRoleFromTemplate(ctx, parse(z.string().max(60), key));
    revalidatePath("/configuracoes/perfis");
    return undefined;
  });
}
