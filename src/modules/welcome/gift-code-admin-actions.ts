"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requirePlatform } from "@/server/platform";
import { createGiftCode, revokeGiftCode } from "@/server/services/gift-code.service";

const giftCodeInputSchema = z.object({
  label: z.string().trim().min(3).max(100),
  benefitType: z.enum(["TRIAL_EXTENSION", "PLAN_ACCESS"]),
  planKey: z.string().max(40).nullable(),
  accessDays: z.number().int().min(1).max(3650),
  usageLimit: z.number().int().min(1).max(100_000),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  stackable: z.literal(false),
});

export async function createGiftCodeAction(input: unknown): Promise<ActionState<{ code: string; id: string }>> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    const data = parse(giftCodeInputSchema, input);
    const startsAt = data.startsAt ? new Date(`${data.startsAt}T00:00:00-03:00`) : null;
    const expiresAt = data.expiresAt ? new Date(`${data.expiresAt}T23:59:59.999-03:00`) : null;
    if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("Data inicial inválida.");
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error("Data final inválida.");
    const result = await createGiftCode(pc, { ...data, startsAt, expiresAt });
    revalidatePath("/admin/codigos");
    return result;
  });
}

export async function revokeGiftCodeAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { pc } = await requirePlatform();
    await revokeGiftCode(pc, parse(z.uuid(), id));
    revalidatePath("/admin/codigos");
    return undefined;
  });
}
