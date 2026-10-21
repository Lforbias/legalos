"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { deleteCredential, saveMyCredential, verifyMyCredential } from "@/server/services/court-credential.service";
import { requireTenant } from "@/server/session";

const saveSchema = z.object({
  system: z.string().min(1).max(40),
  courtCode: z.string().max(10).nullable().optional(),
  authMode: z.string().min(1).max(40),
  document: z.string().min(1).max(30),
  password: z.string().max(200).nullable().optional(),
  certificateId: z.string().nullable().optional(),
});

export async function saveCredentialAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(saveSchema, input);
    await saveMyCredential(ctx, { ...v, certificateId: v.certificateId ? parse(uuidSchema, v.certificateId) : null });
    revalidatePath("/configuracoes/credenciais");
    return undefined;
  });
}

export async function deleteCredentialAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteCredential(ctx, parse(uuidSchema, id));
    revalidatePath("/configuracoes/credenciais");
    return undefined;
  });
}

export async function verifyCredentialAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await verifyMyCredential(ctx, parse(uuidSchema, id));
    revalidatePath("/configuracoes/credenciais");
    return undefined;
  });
}
