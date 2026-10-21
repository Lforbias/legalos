"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import {
  cancelEntry, createAccount, createCategory, createCostCenter, createEntry, registerPayment, reversePayment, setAccountActive, setCategoryActive, setCostCenterActive, updateEntry,
} from "@/server/services/finance.service";
import { accountSchema, categorySchema, costCenterSchema, entrySchema, paymentSchema, reasonSchema } from "./schemas";

const touch = (entryId?: string) => {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  if (entryId) revalidatePath(`/financeiro/lancamentos/${entryId}`);
};

export async function createEntryAction(input: unknown): Promise<ActionState<{ id: string; count: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await createEntry(ctx, parse(entrySchema, input));
    touch();
    return { id: r.id, count: r.ids.length };
  });
}

export async function updateEntryAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateEntry(ctx, parse(uuidSchema, id), parse(entrySchema.omit({ installments: true }), input));
    touch(id);
    return undefined;
  });
}

export async function cancelEntryAction(id: string, reason: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await cancelEntry(ctx, parse(uuidSchema, id), parse(reasonSchema, { reason }).reason);
    touch(id);
    return undefined;
  });
}

export async function registerPaymentAction(entryId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await registerPayment(ctx, parse(uuidSchema, entryId), parse(paymentSchema, input));
    touch(entryId);
    return undefined;
  });
}

export async function reversePaymentAction(paymentId: string, entryId: string, reason: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await reversePayment(ctx, parse(uuidSchema, paymentId), parse(reasonSchema, { reason }).reason);
    touch(parse(uuidSchema, entryId));
    return undefined;
  });
}

const settings = () => revalidatePath("/financeiro/cadastros");

export async function createAccountAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createAccount(ctx, parse(accountSchema, input));
    settings();
    return undefined;
  });
}
export async function setAccountActiveAction(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setAccountActive(ctx, parse(uuidSchema, id), parse(z.boolean(), active));
    settings();
    return undefined;
  });
}
export async function createCategoryAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createCategory(ctx, parse(categorySchema, input));
    settings();
    return undefined;
  });
}
export async function setCategoryActiveAction(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setCategoryActive(ctx, parse(uuidSchema, id), parse(z.boolean(), active));
    settings();
    return undefined;
  });
}
export async function createCostCenterAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createCostCenter(ctx, parse(costCenterSchema, input));
    settings();
    return undefined;
  });
}
export async function setCostCenterActiveAction(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setCostCenterActive(ctx, parse(uuidSchema, id), parse(z.boolean(), active));
    settings();
    return undefined;
  });
}
