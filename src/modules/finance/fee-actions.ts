"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parseMoneyBR } from "@/lib/validation/money";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { cancelFeeCharge, cancelFeeContract, createFeeCharge, createFeeContract, saveFeeAsaasConfig, setFeeAsaasEnabled, testFeeAsaas, triggerFeeContract } from "@/server/services/fee-charge.service";

const opt = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const moneyOpt = (v: string | undefined) => { const t = opt(v); if (!t) return null; const m = parseMoneyBR(t); if (!m) throw new Error("Valor inválido. Exemplo: 1.234,56"); return m; };

export async function saveFeeConfigAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ apiKey: z.string().max(300).optional(), sandbox: z.boolean(), accountId: uuidSchema }), input);
    await saveFeeAsaasConfig(ctx, v);
    revalidatePath("/financeiro/cobranca");
    return undefined;
  });
}
export async function testFeeConfigAction(): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await testFeeAsaas(ctx); return undefined; });
}
export async function setFeeEnabledAction(on: boolean): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await setFeeAsaasEnabled(ctx, parse(z.boolean(), on)); revalidatePath("/financeiro/cobranca"); return undefined; });
}
export async function createChargeAction(entryId: string, type: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createFeeCharge(ctx, parse(uuidSchema, entryId), parse(z.enum(["PIX", "BOLETO"]), type));
    revalidatePath(`/financeiro/lancamentos/${entryId}`);
    return undefined;
  });
}
export async function cancelChargeAction(chargeId: string, entryId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await cancelFeeCharge(ctx, parse(uuidSchema, chargeId));
    revalidatePath(`/financeiro/lancamentos/${parse(uuidSchema, entryId)}`);
    return undefined;
  });
}
export async function createContractAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(z.object({ clientId: uuidSchema, caseId: z.string().optional(), title: z.string().max(160), percent: z.string().optional(), fixedAmount: z.string().optional(), expectedBase: z.string().optional(), baseNote: z.string().max(300).optional() }), input);
    const pct = opt(v.percent)?.replace(",", ".") ?? null;
    await createFeeContract(ctx, { clientId: v.clientId, caseId: v.caseId && uuidSchema.safeParse(v.caseId).success ? v.caseId : null, title: v.title, percent: pct, fixedAmount: moneyOpt(v.fixedAmount), expectedBase: moneyOpt(v.expectedBase), baseNote: v.baseNote });
    revalidatePath("/financeiro/exito");
    return undefined;
  });
}
export async function triggerContractAction(id: string, base: string, dueDate: string): Promise<ActionState<{ entryId: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    if (!isYmd(dueDate)) throw new Error("Data de vencimento inválida.");
    const r = await triggerFeeContract(ctx, parse(uuidSchema, id), { base: moneyOpt(base) ?? undefined, dueDate });
    revalidatePath("/financeiro/exito");
    return { entryId: r.entryId };
  });
}
export async function cancelContractAction(id: string): Promise<ActionState> {
  return runAction(async () => { const { ctx } = await requireTenant(); await cancelFeeContract(ctx, parse(uuidSchema, id)); revalidatePath("/financeiro/exito"); return undefined; });
}
