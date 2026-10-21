"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@/lib/permissions/check";
import { limiters } from "@/lib/security/rate-limit";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { createInvitation, revokeInvitation } from "@/server/services/invitation.service";
import { changeMemberRole, removeMember, setMemberStatus } from "@/server/services/membership.service";
import { createRole, deleteRole, updateRole } from "@/server/services/role.service";
import { inviteSchema, roleSchema } from "./schemas";

const refresh = () => revalidatePath("/configuracoes", "layout");

export async function inviteAction(input: unknown): Promise<ActionState<{ link: string; emailDelivered: boolean }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const data = parse(inviteSchema, input);
    if (!limiters.invitation.check(`org:${ctx.organizationId}`)) {
      throw new ValidationError("Muitos convites em pouco tempo. Tente novamente mais tarde.");
    }
    const res = await createInvitation(ctx, data);
    refresh();
    return { link: res.link, emailDelivered: res.emailDelivered };
  });
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await revokeInvitation(ctx, parse(uuidSchema, invitationId));
    refresh();
    return undefined;
  });
}

export async function changeMemberRoleAction(membershipId: string, roleId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await changeMemberRole(ctx, parse(uuidSchema, membershipId), parse(uuidSchema, roleId));
    refresh();
    return undefined;
  });
}

export async function setMemberStatusAction(membershipId: string, status: "ACTIVE" | "SUSPENDED"): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    if (status !== "ACTIVE" && status !== "SUSPENDED") throw new ValidationError("Status inválido.");
    await setMemberStatus(ctx, parse(uuidSchema, membershipId), status);
    refresh();
    return undefined;
  });
}

export async function removeMemberAction(membershipId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeMember(ctx, parse(uuidSchema, membershipId));
    refresh();
    return undefined;
  });
}

export async function createRoleAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const data = parse(roleSchema, input);
    await createRole(ctx, { name: data.name, description: data.description || null, permissions: data.permissions });
    refresh();
    return undefined;
  });
}

export async function updateRoleAction(roleId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const data = parse(roleSchema, input);
    await updateRole(ctx, parse(uuidSchema, roleId), { name: data.name, description: data.description || null, permissions: data.permissions });
    refresh();
    return undefined;
  });
}

export async function deleteRoleAction(roleId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteRole(ctx, parse(uuidSchema, roleId));
    refresh();
    return undefined;
  });
}
