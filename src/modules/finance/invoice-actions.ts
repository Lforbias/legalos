"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { cancelInvoice, issueInvoice, setBoleto } from "@/server/services/fee-invoice.service";

const touch = () => {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/faturas");
};

export async function issueInvoiceAction(input: unknown): Promise<ActionState<{ number: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ clientId: uuidSchema, entryIds: z.array(uuidSchema).min(1, "Marque ao menos um honorário.").max(100), notes: z.string().max(500).optional() }), input);
    const r = await issueInvoice(ctx, v);
    touch();
    return { number: r.number };
  });
}

export async function cancelInvoiceAction(id: string, reason: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await cancelInvoice(ctx, parse(uuidSchema, id), parse(z.string().min(3, "Informe o motivo.").max(300), reason));
    touch();
    return undefined;
  });
}

export async function setBoletoAction(entryId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ code: z.string().max(80).optional(), url: z.string().max(500).optional() }), input);
    await setBoleto(ctx, parse(uuidSchema, entryId), v);
    touch();
    revalidatePath(`/financeiro/lancamentos/${entryId}`);
    return undefined;
  });
}
