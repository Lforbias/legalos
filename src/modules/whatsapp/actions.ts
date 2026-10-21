"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { connectAccount, deleteQuickReply, removeAccount, saveQuickReply, setAccountEnabled, syncTemplates, updateSettings } from "@/server/services/whatsapp-account.service";
import { attachMessageToDocuments, caseOptions, createDeadlineFromConversation, createEventFromConversation, createLeadFromConversation, createTaskFromConversation, linkCase, type CaseOption } from "@/server/services/chat-links.service";
import { deleteQueue, distributePending, saveQueue, setMyAvailability, transferToQueue } from "@/server/services/chat-queue.service";
import { deleteAutomation, saveAutomation, setAutomationActive } from "@/server/services/chat-automation.service";
import { setSwitch, stopAllMessaging, SWITCH_KEYS } from "@/server/services/chat-switches.service";
import { saveBot } from "@/server/services/chat-bot.service";
import { saveSla } from "@/server/services/chat-sla.service";
import { createTriageRules } from "@/server/services/chat-triage.service";
import { sendToClient } from "@/server/services/chat-send.service";
import { billingPreview, removeOptout, saveBillingSettings, sendBillingNow } from "@/server/services/chat-billing.service";
import { deleteField, deleteLabel, saveField, saveLabel, setConversationLabels, setFieldValues } from "@/server/services/chat-meta.service";
import { connectQr, disconnectQr, getQrStatus, restartQr, type QrStatus } from "@/server/services/whatsapp-qr.service";
import { addNote, assignConversation, linkClient, searchClientsForLink, sendMessage, sendTemplateMessage, setConversationStatus, startConversation } from "@/server/services/whatsapp.service";

const text = z.string().max(5000);

export async function sendMessageAction(conversationId: string, body: string): Promise<ActionState<{ status: string; error: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await sendMessage(ctx, parse(uuidSchema, conversationId), parse(text, body));
    revalidatePath("/atendimento");
    return { status: r.status, error: r.error };
  });
}

export async function sendTemplateAction(conversationId: string, templateId: string, params: string[]): Promise<ActionState<{ status: string; error: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await sendTemplateMessage(ctx, parse(uuidSchema, conversationId), parse(uuidSchema, templateId), parse(z.array(z.string().max(600)).max(20), params));
    revalidatePath("/atendimento");
    return { status: r.status, error: r.error };
  });
}

export async function addNoteAction(conversationId: string, body: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addNote(ctx, parse(uuidSchema, conversationId), parse(text, body));
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function assignAction(conversationId: string, userId: string | null): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await assignConversation(ctx, parse(uuidSchema, conversationId), parse(uuidSchema.nullable(), userId));
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function setStatusAction(conversationId: string, status: "OPEN" | "CLOSED"): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setConversationStatus(ctx, parse(uuidSchema, conversationId), parse(z.enum(["OPEN", "CLOSED"]), status));
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function linkClientAction(conversationId: string, clientId: string | null): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await linkClient(ctx, parse(uuidSchema, conversationId), parse(uuidSchema.nullable(), clientId));
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function searchClientsAction(q: string): Promise<ActionState<{ id: string; name: string }[]>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return searchClientsForLink(ctx, parse(z.string().max(80), q));
  });
}

export async function startConversationAction(phone: string, clientId: string | null): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await startConversation(ctx, { phone: parse(z.string().min(8).max(30), phone), clientId: parse(uuidSchema.nullable(), clientId) });
    revalidatePath("/atendimento");
    return r;
  });
}

// ---- configuração ----
const connectSchema = z.object({
  label: z.string().trim().min(1, "Dê um nome ao número.").max(80),
  phoneNumberId: z.string().trim().min(1, "Informe o ID do número de telefone.").max(30),
  wabaId: z.string().trim().max(30).optional().nullable(),
  token: z.string().trim().min(1, "Cole o token de acesso.").max(1000),
});

export async function connectAction(input: z.input<typeof connectSchema>): Promise<ActionState<{ displayPhone: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await connectAccount(ctx, parse(connectSchema, input));
    revalidatePath("/atendimento/configuracoes");
    return { displayPhone: r.displayPhone };
  });
}

export async function setEnabledAction(enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setAccountEnabled(ctx, parse(z.boolean(), enabled));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function removeAccountAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeAccount(ctx);
    revalidatePath("/atendimento");
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

const settingsSchema = z.object({ awayEnabled: z.boolean(), awayMessage: z.string().max(1200).nullable().optional(), openFrom: z.string().max(5), openUntil: z.string().max(5), openDays: z.array(z.number().int().min(0).max(6)).max(7) });

export async function updateSettingsAction(input: z.input<typeof settingsSchema>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateSettings(ctx, parse(settingsSchema, input));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

const quickSchema = z.object({ shortcut: z.string().trim().min(1, "Informe o atalho.").max(32), title: z.string().trim().min(2, "Informe o título.").max(80), body: z.string().min(1, "Escreva o texto.").max(4096) });

export async function saveQuickReplyAction(id: string | null, input: z.input<typeof quickSchema>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveQuickReply(ctx, id ? parse(uuidSchema, id) : null, parse(quickSchema, input));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function deleteQuickReplyAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteQuickReply(ctx, parse(uuidSchema, id));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function syncTemplatesAction(): Promise<ActionState<{ total: number; approved: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await syncTemplates(ctx);
    revalidatePath("/atendimento/configuracoes");
    return r;
  });
}

export async function connectQrAction(input: { label: string; riskAck: boolean }): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await connectQr(ctx, parse(z.object({ label: z.string().max(200), riskAck: z.boolean() }), input));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function qrStatusAction(): Promise<ActionState<QrStatus>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return getQrStatus(ctx);
  });
}

export async function qrDisconnectAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await disconnectQr(ctx);
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function qrRestartAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await restartQr(ctx);
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");
const optId = z.string().uuid().nullable().optional();

export async function searchCasesAction(conversationId: string, q: string): Promise<ActionState<CaseOption[]>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return caseOptions(ctx, parse(uuidSchema, conversationId), parse(z.string().max(80), q));
  });
}

export async function linkCaseAction(conversationId: string, caseId: string | null): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await linkCase(ctx, parse(uuidSchema, conversationId), parse(uuidSchema.nullable(), caseId));
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function createTaskFromChatAction(conversationId: string, input: { title: string; description?: string; dueDate?: string; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; assigneeId?: string; messageId?: string | null }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const i = parse(z.object({ title: z.string().max(200), description: z.string().max(3000).optional(), dueDate: z.union([ymd, z.literal("")]).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(), assigneeId: z.union([z.string().uuid(), z.literal("")]).optional(), messageId: optId }), input);
    const r = await createTaskFromConversation(ctx, parse(uuidSchema, conversationId), { ...i, assigneeId: i.assigneeId || undefined });
    revalidatePath("/atendimento");
    return r;
  });
}

export async function createEventFromChatAction(conversationId: string, input: { title: string; date: string; kind?: "HEARING" | "MEETING" | "DILIGENCE" | "OTHER"; startTime?: string; endTime?: string; allDay?: boolean; description?: string; messageId?: string | null }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const i = parse(z.object({ title: z.string().max(200), date: ymd, kind: z.enum(["HEARING", "MEETING", "DILIGENCE", "OTHER"]).optional(), startTime: z.union([hhmm, z.literal("")]).optional(), endTime: z.union([hhmm, z.literal("")]).optional(), allDay: z.boolean().optional(), description: z.string().max(1500).optional(), messageId: optId }), input);
    const r = await createEventFromConversation(ctx, parse(uuidSchema, conversationId), i);
    revalidatePath("/atendimento");
    return r;
  });
}

export async function createDeadlineFromChatAction(conversationId: string, input: { title: string; dueDate: string; notes?: string; messageId?: string | null }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const i = parse(z.object({ title: z.string().max(200), dueDate: ymd, notes: z.string().max(1500).optional(), messageId: optId }), input);
    const r = await createDeadlineFromConversation(ctx, parse(uuidSchema, conversationId), i);
    revalidatePath("/atendimento");
    return r;
  });
}

export async function createLeadFromChatAction(conversationId: string, input: { name?: string; interest?: string }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const i = parse(z.object({ name: z.string().max(160).optional(), interest: z.string().max(120).optional() }), input);
    const r = await createLeadFromConversation(ctx, parse(uuidSchema, conversationId), i);
    revalidatePath("/atendimento");
    return r;
  });
}

export async function attachToDocumentsAction(messageId: string, target: "case" | "client"): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await attachMessageToDocuments(ctx, parse(uuidSchema, messageId), parse(z.enum(["case", "client"]), target));
    revalidatePath("/atendimento");
    return r;
  });
}

export async function saveQueueAction(id: string | null, input: { name: string; teamId?: string | null; strategy: "ROUND_ROBIN" | "LEAST_LOAD" | "MANUAL"; isDefault?: boolean; active?: boolean }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const i = parse(z.object({ name: z.string().max(100), teamId: z.string().uuid().nullable().optional(), strategy: z.enum(["ROUND_ROBIN", "LEAST_LOAD", "MANUAL"]), isDefault: z.boolean().optional(), active: z.boolean().optional() }), input);
    const r = await saveQueue(ctx, parse(uuidSchema.nullable(), id), i);
    revalidatePath("/atendimento/configuracoes");
    return r;
  });
}

export async function deleteQueueAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteQueue(ctx, parse(uuidSchema, id));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function distributePendingAction(): Promise<ActionState<{ assigned: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await distributePending(ctx);
    revalidatePath("/atendimento");
    return r;
  });
}

export async function transferQueueAction(conversationId: string, queueId: string | null): Promise<ActionState<{ agent: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await transferToQueue(ctx, parse(uuidSchema, conversationId), parse(uuidSchema.nullable(), queueId));
    revalidatePath("/atendimento");
    return r;
  });
}

export async function setAvailabilityAction(available: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setMyAvailability(ctx, parse(z.boolean(), available));
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function saveLabelAction(id: string | null, input: { name: string; color: string }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await saveLabel(ctx, parse(uuidSchema.nullable(), id), parse(z.object({ name: z.string().max(100), color: z.string().max(7) }), input));
    revalidatePath("/atendimento");
    revalidatePath("/atendimento/configuracoes");
    return r;
  });
}

export async function deleteLabelAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteLabel(ctx, parse(uuidSchema, id));
    revalidatePath("/atendimento");
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function setLabelsAction(conversationId: string, labelIds: string[]): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setConversationLabels(ctx, parse(uuidSchema, conversationId), parse(z.array(z.string().uuid()).max(50), labelIds));
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function saveFieldAction(id: string | null, input: { name: string; kind: "TEXT" | "NUMBER" | "DATE" | "SELECT"; options?: string[]; active?: boolean }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const i = parse(z.object({ name: z.string().max(100), kind: z.enum(["TEXT", "NUMBER", "DATE", "SELECT"]), options: z.array(z.string().max(100)).max(60).optional(), active: z.boolean().optional() }), input);
    const r = await saveField(ctx, parse(uuidSchema.nullable(), id), i);
    revalidatePath("/atendimento");
    revalidatePath("/atendimento/configuracoes");
    return r;
  });
}

export async function deleteFieldAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteField(ctx, parse(uuidSchema, id));
    revalidatePath("/atendimento");
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function setFieldValuesAction(conversationId: string, values: Record<string, string | null>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setFieldValues(ctx, parse(uuidSchema, conversationId), parse(z.record(z.string().uuid(), z.string().max(600).nullable()), values));
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function saveAutomationAction(id: string | null, input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await saveAutomation(ctx, parse(uuidSchema.nullable(), id), input);
    revalidatePath("/atendimento/configuracoes");
    return r;
  });
}

export async function setAutomationActiveAction(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setAutomationActive(ctx, parse(uuidSchema, id), parse(z.boolean(), active));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function deleteAutomationAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteAutomation(ctx, parse(uuidSchema, id));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function saveBotAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveBot(ctx, input);
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function saveBillingAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveBillingSettings(ctx, input);
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function removeOptoutAction(waId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeOptout(ctx, parse(z.string().min(5).max(30), waId));
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function billNowAction(entryId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await sendBillingNow(ctx, parse(uuidSchema, entryId));
    revalidatePath(`/financeiro/lancamentos/${entryId}`);
    return undefined;
  });
}

export async function setSwitchAction(key: string, on: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setSwitch(ctx, parse(z.enum(SWITCH_KEYS), key), parse(z.boolean(), on));
    revalidatePath("/atendimento/configuracoes");
    revalidatePath("/atendimento");
    return undefined;
  });
}

export async function stopAllMessagingAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await stopAllMessaging(ctx);
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function billingPreviewAction(): Promise<ActionState<{ windowOpenNow: boolean; wouldSend: number; clients: number; saved: boolean }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return billingPreview(ctx);
  });
}

export async function saveSlaAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveSla(ctx, input);
    revalidatePath("/atendimento/configuracoes");
    return undefined;
  });
}

export async function createTriageRulesAction(input: unknown): Promise<ActionState<{ created: string[]; skipped: string[] }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await createTriageRules(ctx, input);
    revalidatePath("/atendimento/configuracoes");
    return r;
  });
}

export async function sendToClientAction(input: unknown, source: "case" | "client" | "birthday"): Promise<ActionState<{ status: string; error: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await sendToClient(ctx, input, parse(z.enum(["case", "client", "birthday"]), source));
    revalidatePath("/atendimento");
    return { status: r.status, error: r.error };
  });
}
