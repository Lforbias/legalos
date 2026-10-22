"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { addFollowUp, askSurvey, cancelScheduled, completeFollowUp, deleteForm, saveForm, scheduleMessage, setExtrasSettings } from "@/server/services/chat-extras.service";
import { addMetaNumber, addQrNumber, removeNumber, renameNumber, restartNumberQr, numberQrStatus, setNumberEnabled } from "@/server/services/whatsapp-numbers.service";

const done = (p: string) => revalidatePath(p);
const when = z.string().min(10).max(40).transform((s, c) => { const d = new Date(s); if (Number.isNaN(d.getTime())) { c.addIssue({ code: "custom", message: "Data e hora inválidas." }); return z.NEVER; } return d; });

// ---- números ----
export async function addMetaNumberAction(input: { label: string; phoneNumberId: string; wabaId?: string; token: string }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await addMetaNumber(ctx, input); done("/atendimento/configuracoes"); return { id: r.id }; });
}
export async function addQrNumberAction(input: { label: string; riskAck: boolean }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await addQrNumber(ctx, input); done("/atendimento/configuracoes"); return { id: r.id }; });
}
export async function setNumberEnabledAction(id: string, enabled: boolean): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await setNumberEnabled(ctx, parse(uuidSchema, id), enabled); done("/atendimento/configuracoes"); return undefined; });
}
export async function renameNumberAction(id: string, label: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await renameNumber(ctx, parse(uuidSchema, id), label); done("/atendimento"); done("/atendimento/configuracoes"); return undefined; });
}
export async function removeNumberAction(id: string, confirm: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await removeNumber(ctx, parse(uuidSchema, id), confirm); done("/atendimento"); done("/atendimento/configuracoes"); return undefined; });
}
export async function numberQrStatusAction(id: string): Promise<ActionState<{ state: string | null; qrDataUrl: string | null; phone: string | null; message: string | null }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await numberQrStatus(ctx, parse(uuidSchema, id)); return { state: r.state, qrDataUrl: r.qrDataUrl, phone: r.phone, message: r.message }; });
}
export async function restartNumberQrAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await restartNumberQr(ctx, parse(uuidSchema, id)); done("/atendimento/configuracoes"); return undefined; });
}

// ---- chaves e formulários ----
export async function setExtrasSettingsAction(input: Partial<Record<"scheduledEnabled" | "npsEnabled" | "aiSummaryEnabled" | "archiveEnabled" | "npsAutoOnClose" | "campaignsEnabled" | "delegateEnabled" | "intentsEnabled" | "transcribeEnabled", boolean>> & { npsQuestion?: string; archiveDays?: number }): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await setExtrasSettings(ctx, input); done("/atendimento/configuracoes"); return undefined; });
}
export async function saveFormAction(id: string | null, input: { name: string; fields: { fieldId: string; required: boolean }[]; active?: boolean }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await saveForm(ctx, id ? parse(uuidSchema, id) : null, input); done("/atendimento/configuracoes"); done("/atendimento"); return r; });
}
export async function deleteFormAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await deleteForm(ctx, parse(uuidSchema, id)); done("/atendimento/configuracoes"); done("/atendimento"); return undefined; });
}

// ---- dentro da conversa ----
export async function addFollowUpAction(conversationId: string, input: { dueAt: string; note: string; assigneeId?: string }): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await addFollowUp(ctx, parse(uuidSchema, conversationId), { dueAt: parse(when, input.dueAt), note: input.note, assigneeId: input.assigneeId || null }); done("/atendimento"); return undefined; });
}
export async function completeFollowUpAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await completeFollowUp(ctx, parse(uuidSchema, id)); done("/atendimento"); return undefined; });
}
export async function scheduleMessageAction(conversationId: string, input: { text: string; sendAt: string }): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await scheduleMessage(ctx, parse(uuidSchema, conversationId), { text: input.text, sendAt: parse(when, input.sendAt) }); done("/atendimento"); return undefined; });
}
export async function cancelScheduledAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await cancelScheduled(ctx, parse(uuidSchema, id)); done("/atendimento"); return undefined; });
}
export async function askSurveyAction(conversationId: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await askSurvey(ctx, parse(uuidSchema, conversationId)); done("/atendimento"); return undefined; });
}
