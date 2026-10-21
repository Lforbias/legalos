"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { createWebhook, deleteWebhook, retryDelivery, setWebhookEnabled, testWebhook, WEBHOOK_EVENT_LIST } from "@/server/services/webhook.service";
import { requireTenant } from "@/server/session";

const schema = z.object({
  name: z.string().trim().min(3, "Dê um nome de ao menos 3 caracteres.").max(80),
  url: z.string().trim().min(8, "Informe o endereço (https://...).").max(500),
  events: z.array(z.enum(WEBHOOK_EVENT_LIST as [string, ...string[]])).min(1, "Escolha ao menos um evento."),
});

/** Devolve o segredo de assinatura UMA única vez. */
export async function createWebhookAction(input: z.input<typeof schema>): Promise<ActionState<{ secret: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await createWebhook(ctx, parse(schema, input));
    revalidatePath("/integracoes");
    return { secret: r.secret };
  });
}

export async function setWebhookEnabledAction(id: string, enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setWebhookEnabled(ctx, parse(uuidSchema, id), parse(z.boolean(), enabled));
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function deleteWebhookAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteWebhook(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function testWebhookAction(id: string): Promise<ActionState<{ ok: boolean; statusCode: number | null; error: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await testWebhook(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    return r;
  });
}

export async function retryDeliveryAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await retryDelivery(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    return undefined;
  });
}
