"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { ValidationError } from "@/lib/permissions/check";
import { assertCan } from "@/server/context";
import { parseStatementCsv, type StatementMapping } from "@/lib/finance/statement-csv";
import { ignoreStatementLine, reconcileStatementLine } from "@/server/services/bank-reconciliation.service";
import { db } from "@/lib/db/client";

const mappingSchema = z.object({
  date: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(200),
  amount: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(200).optional(),
  direction: z.string().trim().max(200).optional(),
});

export async function previewStatementFileAction(form: FormData): Promise<ActionState<{ headers: string[]; sample: Record<string, string>[] }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "finance:write");
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size < 1 || file.size > 8 * 1024 * 1024) {
      throw new ValidationError("Selecione um CSV de até 8 MB.");
    }
    const parsed = parseStatementCsv(await file.text());
    if (!parsed.headers.length) throw new ValidationError("O CSV precisa ter cabeçalho e pelo menos uma linha.");
    return { headers: parsed.headers, sample: parsed.sample };
  });
}

export async function previewMappedStatementAction(form: FormData): Promise<ActionState<{
  valid: number; invalid: number; repeated: number;
  sample: { postedOn: string; description: string; amount: string; direction: string; duplicate: boolean }[];
}>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "finance:write");
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size < 1 || file.size > 8 * 1024 * 1024) throw new ValidationError("Selecione um CSV de até 8 MB.");
    const accountId = parse(uuidSchema, form.get("accountId"));
    const mapping = parse(mappingSchema, {
      date: form.get("date"), description: form.get("description"), amount: form.get("amount"),
      reference: form.get("reference") || undefined, direction: form.get("direction") || undefined,
    }) as StatementMapping;
    const parsed = parseStatementCsv(await file.text(), mapping, accountId);
    if (parsed.lines.length + parsed.invalidCount + parsed.duplicateCount > 5000) throw new ValidationError("O extrato pode conter até 5.000 linhas.");
    const existing = await db.bankStatementLine.findMany({
      where: { organizationId: ctx.organizationId, fingerprint: { in: parsed.lines.map((line) => line.fingerprint) } },
      select: { fingerprint: true },
    });
    const existingFingerprints = new Set(existing.map((line) => line.fingerprint));
    return {
      valid: parsed.lines.length - existingFingerprints.size,
      invalid: parsed.invalidCount,
      repeated: parsed.duplicateCount + existingFingerprints.size,
      sample: parsed.lines.slice(0, 25).map((line) => ({ postedOn: line.postedOn, description: line.description, amount: line.amount, direction: line.direction, duplicate: existingFingerprints.has(line.fingerprint) })),
    };
  });
}

export async function reconcileStatementLineAction(importId: string, lineId: string, entryId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await reconcileStatementLine(ctx, parse(uuidSchema, importId), parse(uuidSchema, lineId), parse(uuidSchema, entryId));
    revalidatePath("/financeiro/conciliacao");
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/lancamentos");
    return undefined;
  });
}

export async function ignoreStatementLineAction(importId: string, lineId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await ignoreStatementLine(ctx, parse(uuidSchema, importId), parse(uuidSchema, lineId));
    revalidatePath("/financeiro/conciliacao");
    return undefined;
  });
}
