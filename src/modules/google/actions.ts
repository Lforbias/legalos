"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { deleteDriveIntegration, disconnectDrive, pullDocumentFromDrive, saveDriveCredentials, sendDocumentToDrive, setDriveEnabled, unlinkDocumentDrive } from "@/server/services/google-drive.service";
import { requireTenant } from "@/server/session";

const credSchema = z.object({ clientId: z.string().max(300), clientSecret: z.string().max(300), folderName: z.string().max(100).nullable().optional() });

export async function saveDriveCredentialsAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveDriveCredentials(ctx, parse(credSchema, input));
    revalidatePath("/integracoes");
    return undefined;
  });
}
export async function setDriveEnabledAction(enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setDriveEnabled(ctx, parse(z.boolean(), enabled));
    revalidatePath("/integracoes");
    return undefined;
  });
}
export async function disconnectDriveAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await disconnectDrive(ctx);
    revalidatePath("/integracoes");
    return undefined;
  });
}
export async function deleteDriveAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteDriveIntegration(ctx);
    revalidatePath("/integracoes");
    return undefined;
  });
}
export async function sendToDriveAction(documentId: string, asGoogleDoc: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await sendDocumentToDrive(ctx, parse(uuidSchema, documentId), { asGoogleDoc: parse(z.boolean(), asGoogleDoc) });
    revalidatePath(`/documentos/${documentId}`);
    return undefined;
  });
}
export async function pullFromDriveAction(documentId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await pullDocumentFromDrive(ctx, parse(uuidSchema, documentId));
    revalidatePath(`/documentos/${documentId}`);
    return undefined;
  });
}
export async function unlinkDriveAction(documentId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await unlinkDocumentDrive(ctx, parse(uuidSchema, documentId));
    revalidatePath(`/documentos/${documentId}`);
    return undefined;
  });
}
