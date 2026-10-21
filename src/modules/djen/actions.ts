"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { createMonitor, deleteMonitor, setMonitorEnabled, setMonitorRecipients, syncDjen, type DjenSyncResult } from "@/server/services/djen.service";
import { requireTenant } from "@/server/session";

const monitorSchema = z.object({ label: z.string().trim().min(2, "Dê um nome.").max(80), oabNumber: z.string().trim().min(1, "Informe o número da OAB."), oabUf: z.string().trim().length(2, "Selecione a UF.") });

export async function createMonitorAction(input: z.input<typeof monitorSchema>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createMonitor(ctx, parse(monitorSchema, input));
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function setMonitorEnabledAction(id: string, enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setMonitorEnabled(ctx, parse(uuidSchema, id), parse(z.boolean(), enabled));
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function deleteMonitorAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteMonitor(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    return undefined;
  });
}

export async function syncDjenAction(id: string): Promise<ActionState<DjenSyncResult>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await syncDjen(ctx, parse(uuidSchema, id));
    revalidatePath("/integracoes");
    revalidatePath("/caixa-de-entrada");
    return r;
  });
}

export async function setMonitorRecipientsAction(id: string, target: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const [kind, ref] = target.split(":");
    const uid = kind === "u" ? parse(uuidSchema, ref) : null;
    const tid = kind === "t" ? parse(uuidSchema, ref) : null;
    await setMonitorRecipients(ctx, parse(uuidSchema, id), { userId: uid, teamId: tid });
    revalidatePath("/integracoes");
    return undefined;
  });
}
