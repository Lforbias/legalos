"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requirePlatform } from "@/server/platform";
import { previewAnnouncement, sendAnnouncement, type AnnouncementPreview } from "@/server/services/announcement.service";
import { retryDeliveryAsPlatform, retryMailAsPlatform, runJobManually, switchOffForOrganization, testIntegration, type TestResult } from "@/server/services/developer.service";

const key = z.string().min(1).max(40);

export async function runJobAction(job: string): Promise<ActionState<{ message: string }>> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    const r = await runJobManually(pc, parse(key, job));
    revalidatePath("/admin/developer");
    if (!r.ok) throw new Error(r.message);
    const parts = Object.entries(r.summary).map(([k, v]) => `${k}: ${String(v)}`);
    return { message: parts.length ? `Rotina concluída — ${parts.join(", ")}.` : "Rotina concluída." };
  });
}

export async function testIntegrationAction(k: string): Promise<ActionState<TestResult>> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    const r = await testIntegration(pc, parse(key, k));
    revalidatePath("/admin/developer");
    return r;
  });
}

export async function retryDeliveryAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await retryDeliveryAsPlatform(pc, parse(uuidSchema, id));
    revalidatePath("/admin/developer");
    return undefined;
  });
}

export async function retryMailAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await retryMailAsPlatform(pc, parse(uuidSchema, id));
    revalidatePath("/admin/developer");
    return undefined;
  });
}

export async function switchOffAction(orgId: string, k: string): Promise<ActionState<{ changed: number }>> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    const r = await switchOffForOrganization(pc, parse(uuidSchema, orgId), parse(key, k));
    revalidatePath("/admin/developer");
    return r;
  });
}

export async function previewAnnouncementAction(input: unknown): Promise<ActionState<AnnouncementPreview>> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    return previewAnnouncement(pc, input);
  });
}

export async function sendAnnouncementAction(input: unknown, confirmRecipients: number): Promise<ActionState<{ recipients: number; inApp: number; pushSent: number; pushFailed: number }>> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    const r = await sendAnnouncement(pc, input, parse(z.number().int().min(0), confirmRecipients));
    revalidatePath("/admin/developer");
    return r;
  });
}
