"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseImport } from "@/lib/comercial/import-rows";
import type { Quote } from "@/lib/comercial/pricing";
import { activitySchema, addonSchema, contactSchema, proposalSchema, prospectSchema, stageSchema } from "@/lib/comercial/schemas";
import { STAGE_KEYS } from "@/lib/comercial/stages";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireComercial } from "@/server/comercial";
import * as svc from "@/server/services/comercial.service";

const touch = (id?: string) => {
  revalidatePath("/comercial", "layout");
  if (id) revalidatePath(`/comercial/escritorios/${id}`);
};

export async function createProspectAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const p = await svc.createProspect(cx, parse(prospectSchema, input));
    touch();
    return { id: p.id };
  });
}
export async function createFromCnpjAction(cnpj: string): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const p = await svc.createFromCnpj(cx, parse(z.string().min(11).max(25), cnpj));
    touch();
    return { id: p.id };
  });
}
export async function addFromBaseAction(cnpj: string): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const p = await svc.addFromBase(cx, parse(z.string().min(11).max(25), cnpj));
    touch();
    return { id: p.id };
  });
}
export async function updateProspectAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.updateProspect(cx, parse(uuidSchema, id), parse(prospectSchema, input));
    touch(id);
    return undefined;
  });
}
export async function deleteProspectAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.deleteProspect(cx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
export async function moveStageAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const i = parse(stageSchema, input);
    await svc.moveStage(cx, parse(uuidSchema, id), i.stage, { lostReason: i.lostReason, wonMonthlyCents: i.wonMonthlyCents ?? null });
    touch(id);
    return undefined;
  });
}
export async function addActivityAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.addActivity(cx, parse(uuidSchema, id), parse(activitySchema, input));
    touch(id);
    return undefined;
  });
}
export async function addContactAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.addContact(cx, parse(uuidSchema, id), parse(contactSchema, input));
    touch(id);
    return undefined;
  });
}
export async function removeContactAction(prospectId: string, contactId: string): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.removeContact(cx, parse(uuidSchema, contactId));
    touch(prospectId);
    return undefined;
  });
}
export async function enrichAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.enrichProspect(cx, parse(uuidSchema, id));
    touch(id);
    return undefined;
  });
}
export async function geocodeAction(id: string): Promise<ActionState<{ found: boolean }>> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const found = await svc.geocodeProspect(cx, parse(uuidSchema, id));
    touch(id);
    return { found };
  });
}
export async function geocodePendingAction(): Promise<ActionState<{ tried: number; found: number; left: number }>> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const r = await svc.geocodePending(cx, 8);
    touch();
    return r;
  });
}
export async function importAction(text: string, enrich: boolean): Promise<ActionState<{ created: number; updated: number; enriched: number; notes: string[]; errors: string[] }>> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const parsed = parseImport(parse(z.string().min(5, "Cole a planilha.").max(400_000), text));
    if (!parsed.rows.length) return { created: 0, updated: 0, enriched: 0, notes: [], errors: parsed.errors.length ? parsed.errors : ["Nenhuma linha válida encontrada. Confira o cabeçalho (nome, cnpj, ...)."] };
    const r = await svc.importProspects(cx, parsed.rows, { enrich });
    touch();
    return { ...r, errors: parsed.errors.slice(0, 30) };
  });
}
export async function quoteAction(input: { planKey: string; users: number; addonKeys: string[]; discountPct: number; setupCents: number }): Promise<ActionState<Quote>> {
  return runAction(async () => {
    await requireComercial();
    const i = parse(z.object({ planKey: z.string().min(1).max(60), users: z.number().int().min(1).max(5000), addonKeys: z.array(z.string().max(60)).max(20), discountPct: z.number().int().min(0).max(100), setupCents: z.number().int().min(0).max(100_000_000) }), input);
    return svc.quoteFor(i.planKey, i.users, i.addonKeys, i.discountPct, i.setupCents);
  });
}
export async function createProposalAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.createProposal(cx, parse(uuidSchema, id), parse(proposalSchema, input));
    touch(id);
    return undefined;
  });
}
export async function setProposalStatusAction(prospectId: string, proposalId: string, status: string): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.setProposalStatus(cx, parse(uuidSchema, proposalId), parse(z.enum(["ENVIADA", "ACEITA", "RECUSADA"]), status));
    touch(prospectId);
    return undefined;
  });
}
export async function saveAddonAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.saveAddon(cx, parse(addonSchema, input));
    touch();
    return undefined;
  });
}
export async function saveSettingsAction(input: { probabilities: Record<string, number>; daysToClose: Record<string, number>; churnMonthlyPct: number }): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const rec = z.partialRecord(z.enum(STAGE_KEYS), z.number());
    const i = parse(z.object({ probabilities: rec, daysToClose: rec, churnMonthlyPct: z.number() }), input);
    await svc.saveSettings(cx, i);
    touch();
    return undefined;
  });
}
export async function addMemberAction(email: string, role: string): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    await svc.addMember(cx, parse(z.email(), email.trim()), parse(z.enum(["GERENTE", "VENDEDOR"]), role));
    touch();
    return undefined;
  });
}
export async function updateMemberAction(userId: string, input: { role?: string; active?: boolean; goal?: string | null }): Promise<ActionState> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const { reaisToCents } = await import("@/lib/comercial/schemas");
    await svc.updateMember(cx, parse(uuidSchema, userId), {
      ...(input.role ? { role: parse(z.enum(["GERENTE", "VENDEDOR"]), input.role) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.goal !== undefined ? { goalMonthlyCents: reaisToCents(input.goal) } : {}),
    });
    touch();
    return undefined;
  });
}

export async function addBaseSampleAction(): Promise<ActionState<{ created: number; existing: number }>> {
  return runAction(async () => {
    const { cx } = await requireComercial();
    const result = await svc.addBaseSample(cx);
    touch();
    return result;
  });
}
