"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { API_SCOPE_LIST, createApiKey, revokeApiKey } from "@/server/services/apikey.service";
import { requireTenant } from "@/server/session";

const schema = z.object({
  name: z.string().trim().min(3, "Dê um nome de ao menos 3 caracteres.").max(80),
  scopes: z.array(z.enum(API_SCOPE_LIST as [string, ...string[]])).min(1, "Escolha ao menos um acesso."),
  expiresInDays: z.number().int().min(1).max(730).nullable(),
});

/** Devolve o token UMA única vez; ele não é guardado em texto puro. */
export async function createApiKeyAction(input: z.input<typeof schema>): Promise<ActionState<{ token: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await createApiKey(ctx, parse(schema, input));
    revalidatePath("/integracoes");
    return { token: r.token };
  });
}

export async function revokeApiKeyAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await revokeApiKey(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    return undefined;
  });
}
