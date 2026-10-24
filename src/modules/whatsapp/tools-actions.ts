"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { campaignClientOptions, approveCampaign, campaignReport, cancelCampaign, createCampaign, pauseCampaign } from "@/server/services/chat-campaigns.service";
import { deleteDialog, deleteIntent, saveDialog, saveIntent, setDialogActive, setIntentActive, testIntents } from "@/server/services/chat-dialogs.service";
import { saveReportSchedule } from "@/server/services/chat-report.service";
import { createLabelPreset, deleteChatStatus, deleteChecklist, deleteLibraryFile, forwardMessage, saveChatStatus, saveChecklist, sendChecklist, sendLibraryFile, setChatStatus, type ForwardResult, type LabelPresetKey } from "@/server/services/chat-tools.service";
import { transcribeMessage } from "@/server/services/chat-transcribe.service";
import { revokeOrgSession, saveSecuritySettings } from "@/server/services/org-security.service";

const cfg = () => { revalidatePath("/atendimento/configuracoes"); revalidatePath("/atendimento"); };
const presetKey = z.enum(["area", "origem", "responsavel"]);
const ids = z.array(uuidSchema).min(1).max(10);

export async function presetLabelsAction(key: string): Promise<ActionState<{ created: string[]; skipped: string[] }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await createLabelPreset(ctx, parse(presetKey, key) as LabelPresetKey); cfg(); return r; });
}
export async function saveChecklistAction(id: string | null, input: { title: string; items: string[] }): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await saveChecklist(ctx, id ? parse(uuidSchema, id) : null, input); cfg(); return undefined; });
}
export async function deleteChecklistAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await deleteChecklist(ctx, parse(uuidSchema, id)); cfg(); return undefined; });
}
export async function sendChecklistAction(conversationId: string, id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await sendChecklist(ctx, parse(uuidSchema, conversationId), parse(uuidSchema, id)); revalidatePath("/atendimento"); return undefined; });
}
export async function saveChatStatusAction(id: string | null, input: { name: string; color: string }): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await saveChatStatus(ctx, id ? parse(uuidSchema, id) : null, input); cfg(); return undefined; });
}
export async function deleteChatStatusAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await deleteChatStatus(ctx, parse(uuidSchema, id)); cfg(); return undefined; });
}
export async function setChatStatusAction(conversationId: string, statusId: string | null): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await setChatStatus(ctx, parse(uuidSchema, conversationId), statusId ? parse(uuidSchema, statusId) : null); revalidatePath("/atendimento"); return undefined; });
}
export async function deleteLibraryFileAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await deleteLibraryFile(ctx, parse(uuidSchema, id)); cfg(); return undefined; });
}
export async function sendLibraryFileAction(conversationId: string, fileId: string): Promise<ActionState<{ status: string }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await sendLibraryFile(ctx, parse(uuidSchema, conversationId), parse(uuidSchema, fileId)); revalidatePath("/atendimento"); return { status: String((r as { status?: string }).status ?? "SENT") }; });
}
export async function forwardMessageAction(messageId: string, targetIds: string[]): Promise<ActionState<{ results: ForwardResult[] }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const results = await forwardMessage(ctx, parse(uuidSchema, messageId), parse(ids, targetIds)); revalidatePath("/atendimento"); return { results }; });
}
export async function transcribeAction(messageId: string): Promise<ActionState<{ text: string; cached: boolean }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await transcribeMessage(ctx, parse(uuidSchema, messageId)); revalidatePath("/atendimento"); return r; });
}

export async function saveDialogAction(id: string | null, input: unknown): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await saveDialog(ctx, id ? parse(uuidSchema, id) : null, input); cfg(); return undefined; });
}
export async function setDialogActiveAction(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await setDialogActive(ctx, parse(uuidSchema, id), active); cfg(); return undefined; });
}
export async function deleteDialogAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await deleteDialog(ctx, parse(uuidSchema, id)); cfg(); return undefined; });
}
export async function saveIntentAction(id: string | null, input: unknown): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await saveIntent(ctx, id ? parse(uuidSchema, id) : null, input); cfg(); return undefined; });
}
export async function setIntentActiveAction(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await setIntentActive(ctx, parse(uuidSchema, id), active); cfg(); return undefined; });
}
export async function deleteIntentAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await deleteIntent(ctx, parse(uuidSchema, id)); cfg(); return undefined; });
}
export async function testIntentsAction(text: string): Promise<ActionState<{ rows: { name: string; score: number; threshold: number; active: boolean }[] }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await testIntents(ctx, parse(z.string().min(1).max(1000), text)); return { rows: r.map((x) => ({ name: x.name, score: x.score, threshold: x.threshold, active: x.active })) }; });
}

export async function createCampaignAction(input: unknown): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await createCampaign(ctx, input); cfg(); return undefined; });
}
export async function approveCampaignAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await approveCampaign(ctx, parse(uuidSchema, id)); cfg(); return undefined; });
}
export async function pauseCampaignAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await pauseCampaign(ctx, parse(uuidSchema, id)); cfg(); return undefined; });
}
export async function cancelCampaignAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await cancelCampaign(ctx, parse(uuidSchema, id)); cfg(); return undefined; });
}
export async function campaignReportAction(id: string,page=1): Promise<ActionState<{ rows: { name: string; status: string; error: string | null }[];page:number;pages:number;total:number }>> {
  return runAction(async () => { const { ctx } = await requireTenant(); const r = await campaignReport(ctx, parse(uuidSchema, id),parse(z.number().int().min(1).max(10000),page)); return {total:r.total,page:r.page,pages:r.pages,rows: r.recipients.map((x) => ({ name: x.name, status: x.status, error: x.error })) }; });
}

export async function saveReportScheduleAction(input: { enabled: boolean; frequency: string; recipients: string[] }): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await saveReportSchedule(ctx, input); revalidatePath("/atendimento/relatorios"); return undefined; });
}

export async function saveSecurityAction(input: { ipAllowlist: string[]; ipEnforced: boolean; idleLogoutMinutes: number | null }): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await saveSecuritySettings(ctx, input); revalidatePath("/configuracoes/seguranca"); return undefined; });
}
export async function revokeOrgSessionAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await revokeOrgSession(ctx, parse(uuidSchema, id)); revalidatePath("/configuracoes/seguranca"); return undefined; });
}

export async function campaignClientOptionsAction(input:unknown){return runAction(async()=>{const {ctx}=await requireTenant();return campaignClientOptions(ctx,input);});}
