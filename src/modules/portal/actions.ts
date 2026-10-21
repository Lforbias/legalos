"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { inviteClientToPortal, revokePortalAccess, revokePortalInvitation, setCaseSharing, setDocumentSharing } from "@/server/services/portal.service";

export async function inviteToPortalAction(clientId: string, email: string): Promise<ActionState<{ link: string; emailDelivered: boolean }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const res = await inviteClientToPortal(ctx, parse(uuidSchema, clientId), parse(z.string().max(254), email));
    revalidatePath(`/clientes/${clientId}`);
    return res;
  });
}
export async function revokePortalAccessAction(accountId: string, clientId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await revokePortalAccess(ctx, parse(uuidSchema, accountId));
    revalidatePath(`/clientes/${parse(uuidSchema, clientId)}`);
    return undefined;
  });
}
export async function revokePortalInvitationAction(invitationId: string, clientId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await revokePortalInvitation(ctx, parse(uuidSchema, invitationId));
    revalidatePath(`/clientes/${parse(uuidSchema, clientId)}`);
    return undefined;
  });
}
export async function setCaseSharingAction(caseId: string, shared: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setCaseSharing(ctx, parse(uuidSchema, caseId), parse(z.boolean(), shared));
    revalidatePath(`/processos/${caseId}`);
    return undefined;
  });
}
export async function setDocumentSharingAction(documentId: string, shared: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setDocumentSharing(ctx, parse(uuidSchema, documentId), parse(z.boolean(), shared));
    revalidatePath(`/documentos/${documentId}`);
    return undefined;
  });
}
