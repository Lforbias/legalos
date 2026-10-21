"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { addContact, archiveClient, createClient, deleteContact, updateClient, updateContact } from "@/server/services/client.service";
import { clientSchema, contactSchema } from "./schemas";

export async function createClientAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const client = await createClient(ctx, parse(clientSchema, input));
    revalidatePath("/clientes");
    return { id: client.id };
  });
}

export async function updateClientAction(id: string, input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const client = await updateClient(ctx, parse(uuidSchema, id), parse(clientSchema, input));
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${client.id}`);
    return { id: client.id };
  });
}

export async function archiveClientAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await archiveClient(ctx, parse(uuidSchema, id));
    revalidatePath("/clientes");
    return undefined;
  });
}

export async function addContactAction(clientId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addContact(ctx, parse(uuidSchema, clientId), parse(contactSchema, input));
    revalidatePath(`/clientes/${clientId}`);
    return undefined;
  });
}

export async function updateContactAction(clientId: string, contactId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateContact(ctx, parse(uuidSchema, contactId), parse(contactSchema, input));
    revalidatePath(`/clientes/${clientId}`);
    return undefined;
  });
}

export async function deleteContactAction(clientId: string, contactId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteContact(ctx, parse(uuidSchema, contactId));
    revalidatePath(`/clientes/${clientId}`);
    return undefined;
  });
}
