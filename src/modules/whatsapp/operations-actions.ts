"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { setServiceStatus, saveLifecycleSettings } from "@/server/services/chat-lifecycle.service";
import { recordManualCall } from "@/server/services/chat-calls.service";
export async function serviceStatusAction(id: string, status: string) { return runAction(async () => { const { ctx } = await requireTenant(); await setServiceStatus(ctx, id, status); revalidatePath("/atendimento"); return undefined; }); }
export async function lifecycleSettingsAction(id: string, input: unknown) { return runAction(async () => { const { ctx } = await requireTenant(); await saveLifecycleSettings(ctx, id, input); revalidatePath("/atendimento/configuracoes"); return undefined; }); }
export async function manualCallAction(id: string, input: unknown) { return runAction(async () => { const { ctx } = await requireTenant(); await recordManualCall(ctx, id, input); revalidatePath("/atendimento"); return undefined; }); }
