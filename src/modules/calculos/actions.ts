"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CalcResult } from "@/lib/calc/num";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { deleteCalculation, loadOfficeTables, runCalculation, saveCalculation, setCalcIndex } from "@/server/services/calculation.service";
import { syncOfficialIndexes } from "@/server/services/monetary-index.service";
import { CALC_KINDS } from "./schemas";

const kindSchema = z.enum(CALC_KINDS);

export async function runCalcAction(kind: string, payload: unknown): Promise<ActionState<CalcResult>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return (await runCalculation(ctx, parse(kindSchema, kind), payload)).result;
  });
}

export async function saveCalcAction(kind: string, payload: unknown, caseId: string | null): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await saveCalculation(ctx, parse(kindSchema, kind), payload, { caseId: caseId ? parse(uuidSchema, caseId) : null });
    revalidatePath("/calculos");
    if (caseId) revalidatePath(`/processos/${caseId}`);
    return r;
  });
}

export async function deleteCalcAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteCalculation(ctx, parse(uuidSchema, id));
    revalidatePath("/calculos");
    return undefined;
  });
}

export async function setIndexAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setCalcIndex(ctx, input);
    revalidatePath("/calculos/indices");
    return undefined;
  });
}

export async function loadTablesAction(): Promise<ActionState<{ added: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await loadOfficeTables(ctx);
    revalidatePath("/calculos/indices");
    return r;
  });
}

export async function syncIndexesAction(years: number): Promise<ActionState<Record<string, { saved: number; error?: string }>>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await syncOfficialIndexes(ctx, { years: parse(z.number().int().min(1).max(35), years) });
    revalidatePath("/calculos/indices");
    return r;
  });
}
