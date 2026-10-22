"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ConflictError } from "@/lib/permissions/check";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { createApiKey } from "@/server/services/apikey.service";
import { revokeMcpConnection } from "@/server/services/mcp-auth.service";
import { createConversation, deleteConversation, sendMessage, type MessageRef } from "@/server/services/rute-assistant.service";
import { deleteInstruction, saveInstruction } from "@/server/services/rute-library.service";
import { approveProposal, rejectProposal, updateProposal } from "@/server/services/rute-proposal.service";
import { setAssistantProvider, setEmergencyStop, setGovernance, setRuteFeature } from "@/server/services/rute-settings.service";
import { callTool, toolList } from "@/server/services/rute-tools.service";
import { requireTenant } from "@/server/session";

const done = () => revalidatePath("/rute");

export async function setFeatureAction(input: { feature: string; on: boolean; consent?: boolean }): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ feature: z.enum(["mcp", "proposals", "assistant"]), on: z.boolean(), consent: z.boolean().optional() }), input);
    await setRuteFeature(ctx, v.feature, v.on, { consent: v.consent });
    done();
    return undefined;
  });
}

export async function setEmergencyStopAction(on: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setEmergencyStop(ctx, parse(z.boolean(), on));
    done();
    return undefined;
  });
}

export async function setProviderAction(input: { provider: string; model?: string; apiKey?: string; clearKey?: boolean }): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setAssistantProvider(ctx, parse(z.object({ provider: z.string(), model: z.string().max(80).optional(), apiKey: z.string().max(300).optional(), clearKey: z.boolean().optional() }), input));
    done();
    return undefined;
  });
}

export async function setGovernanceAction(input: { retentionDays?: number; monthlyTokenLimit?: number | null; roleLimits?: Record<string, number> }): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setGovernance(ctx, parse(z.object({ retentionDays: z.number().optional(), monthlyTokenLimit: z.number().nullable().optional(), roleLimits: z.record(z.string(), z.number()).optional() }), input));
    done();
    return undefined;
  });
}

export async function createMcpKeyAction(input: { name: string; propose: boolean; expiresInDays: number | null }): Promise<ActionState<{ token: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ name: z.string().trim().min(3, "Dê um nome de ao menos 3 caracteres.").max(80), propose: z.boolean(), expiresInDays: z.number().int().min(1).max(730).nullable() }), input);
    const r = await createApiKey(ctx, { name: v.name, scopes: v.propose ? ["mcp:read", "mcp:propose"] : ["mcp:read"], expiresInDays: v.expiresInDays });
    done();
    return { token: r.token };
  });
}

export async function revokeConnectionAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await revokeMcpConnection(ctx, parse(uuidSchema, id));
    done();
    return undefined;
  });
}

/** "Testar conexão": passa pelo mesmo caminho que uma IA externa (interruptor, permissão, ferramenta) com a sessão de quem clicou. */
export async function testMcpAction(): Promise<ActionState<{ tools: number; sample: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const scopes = new Set(["read", "propose"] as const);
    const tools = toolList(ctx, scopes).length;
    const r = await callTool(ctx, new Set(["read"] as const), { via: "MCP", connection: "Teste no LegalOS", provider: "TESTE" }, "hoje", {});
    if (!r.ok) throw new ConflictError(r.text);
    done();
    return { tools, sample: r.text.split("\n").slice(1, 4).join(" ").slice(0, 200) };
  });
}

export async function approveProposalAction(id: string, opts: { confirmHighRisk?: boolean; edited?: Record<string, unknown> }): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await approveProposal(ctx, parse(uuidSchema, id), { confirmHighRisk: opts.confirmHighRisk === true, edited: opts.edited });
    done();
    revalidatePath("/tarefas");
    return undefined;
  });
}

export async function updateProposalAction(id: string, payload: Record<string, unknown>): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateProposal(ctx, parse(uuidSchema, id), payload);
    done();
    return undefined;
  });
}

export async function rejectProposalAction(id: string, note?: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await rejectProposal(ctx, parse(uuidSchema, id), note);
    done();
    return undefined;
  });
}

export async function createConversationAction(input: { caseId?: string | null; clientId?: string | null }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ caseId: uuidSchema.nullish(), clientId: uuidSchema.nullish() }), input);
    const c = await createConversation(ctx, v);
    done();
    return { id: c.id };
  });
}

export async function sendMessageAction(conversationId: string, text: string): Promise<ActionState<{ answer: string; refs: MessageRef[] }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await sendMessage(ctx, parse(uuidSchema, conversationId), parse(z.string().max(6000), text));
    done();
    return { answer: r.answer, refs: r.refs };
  });
}

export async function deleteConversationAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteConversation(ctx, parse(uuidSchema, id));
    done();
    return undefined;
  });
}

export async function saveInstructionAction(input: { id?: string; area: string; kind: string; title: string; body: string; active: boolean }): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await saveInstruction(ctx, input as never);
    done();
    return { id: r.id };
  });
}

export async function deleteInstructionAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteInstruction(ctx, parse(uuidSchema, id));
    done();
    return undefined;
  });
}
