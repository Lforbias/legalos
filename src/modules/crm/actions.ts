"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import {
  acceptProposal, addLeadActivity, changeLeadStage, convertLead, createLead, createProposal, deleteLead, markLeadLost, rejectProposal, reopenLead, sendProposal, updateLead, updateProposal,
} from "@/server/services/crm.service";
import { activitySchema, convertSchema, leadSchema, lostSchema, proposalSchema } from "./schemas";

const touch = (id?: string) => {
  revalidatePath("/crm");
  if (id) revalidatePath(`/crm/${id}`);
};

export async function createLeadAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const l = await createLead(ctx, parse(leadSchema, input));
    touch();
    return { id: l.id };
  });
}

export async function updateLeadAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateLead(ctx, parse(uuidSchema, id), parse(leadSchema, input));
    touch(id);
    return undefined;
  });
}

export async function changeLeadStageAction(id: string, stage: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await changeLeadStage(ctx, parse(uuidSchema, id), parse(z.string().max(20), stage));
    touch(id);
    return undefined;
  });
}

export async function markLeadLostAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await markLeadLost(ctx, parse(uuidSchema, id), parse(lostSchema, input).reason);
    touch(id);
    return undefined;
  });
}

export async function reopenLeadAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await reopenLead(ctx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}

export async function addLeadActivityAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addLeadActivity(ctx, parse(uuidSchema, id), parse(activitySchema, input));
    touch(id);
    return undefined;
  });
}

export async function convertLeadAction(id: string, input: unknown): Promise<ActionState<{ clientId: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const res = await convertLead(ctx, parse(uuidSchema, id), parse(convertSchema, input).document);
    touch(id);
    revalidatePath("/clientes");
    return res;
  });
}

export async function deleteLeadAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteLead(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}

export async function createProposalAction(leadId: string, input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const p = await createProposal(ctx, parse(uuidSchema, leadId), parse(proposalSchema, input));
    touch(leadId);
    return { id: p.id };
  });
}

export async function updateProposalAction(id: string, input: unknown): Promise<ActionState<{ leadId: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const leadId = await updateProposal(ctx, parse(uuidSchema, id), parse(proposalSchema, input));
    touch(leadId);
    return { leadId };
  });
}

async function step(id: string, fn: (ctx: Awaited<ReturnType<typeof requireTenant>>["ctx"], id: string) => Promise<string>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    touch(await fn(ctx, parse(uuidSchema, id)));
    return undefined;
  });
}
export async function sendProposalAction(id: string): Promise<ActionState> {
  return step(id, sendProposal);
}
export async function acceptProposalAction(id: string): Promise<ActionState> {
  return step(id, acceptProposal);
}
export async function rejectProposalAction(id: string): Promise<ActionState> {
  return step(id, rejectProposal);
}
