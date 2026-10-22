"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { addCaseFee, linkCases, removeAppeal, removeCaseFee, saveAppeal, setValuation, unlinkCases } from "@/server/services/case-extras.service";
import { setManualIndex, syncOfficialIndexes } from "@/server/services/monetary-index.service";
import { appealSchema, feeSchema, linkSchema, valuationSchema } from "./case-extras-schemas";

const touch = (id: string) => revalidatePath(`/processos/${id}`);

export async function addFeeAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addCaseFee(ctx, parse(uuidSchema, caseId), parse(feeSchema, input));
    touch(caseId);
    return undefined;
  });
}
export async function removeFeeAction(caseId: string, feeId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeCaseFee(ctx, parse(uuidSchema, caseId), parse(uuidSchema, feeId));
    touch(caseId);
    return undefined;
  });
}
export async function linkCasesAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await linkCases(ctx, parse(uuidSchema, caseId), parse(linkSchema, input));
    touch(caseId);
    return undefined;
  });
}
export async function unlinkCasesAction(caseId: string, linkId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await unlinkCases(ctx, parse(uuidSchema, caseId), parse(uuidSchema, linkId));
    touch(caseId);
    return undefined;
  });
}
export async function saveAppealAction(caseId: string, input: unknown, appealId?: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveAppeal(ctx, parse(uuidSchema, caseId), parse(appealSchema, input), appealId ? parse(uuidSchema, appealId) : undefined);
    touch(caseId);
    return undefined;
  });
}
export async function removeAppealAction(caseId: string, appealId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeAppeal(ctx, parse(uuidSchema, caseId), parse(uuidSchema, appealId));
    touch(caseId);
    return undefined;
  });
}
export async function setValuationAction(caseId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setValuation(ctx, parse(uuidSchema, caseId), parse(valuationSchema, input));
    touch(caseId);
    return undefined;
  });
}
export async function syncIndexesAction(caseId: string): Promise<ActionState<{ summary: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await syncOfficialIndexes(ctx);
    touch(caseId);
    return { summary: Object.entries(r).map(([k, v]) => (v.error ? `${k}: falhou (${v.error})` : `${k}: ${v.saved} meses`)).join(" · ") };
  });
}
export async function manualIndexAction(caseId: string, series: string, month: string, rate: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setManualIndex(ctx, series, month, rate);
    touch(caseId);
    return undefined;
  });
}
