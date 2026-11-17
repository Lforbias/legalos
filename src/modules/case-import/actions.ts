"use server";

import { parseCnj } from "@/lib/validation/br-documents";
import { IMPORT_MAX, parseNumberList } from "@/lib/case-import";
import { readProcessXlsx } from "@/lib/import/process-xlsx";
import { normalizeDelimiter, parseCsv } from "@/lib/import/csv";
import { ValidationError } from "@/lib/permissions/check";
import { assertCan } from "@/server/context";
import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { batchInputSchema, createImportBatch, processBatchStep } from "@/server/services/case-import.service";
import { db } from "@/lib/db/client";

export async function previewProcessSheetAction(form: FormData): Promise<ActionState<{ columns: { name: string; values: string[]; total: number }[] }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "cases:write");
    const file = form.get("file");
    const extension = file instanceof File ? /\.(csv|xlsx)$/i.exec(file.name)?.[1]?.toLowerCase() : null;
    if (!(file instanceof File) || !extension || file.size > 512 * 1024) {
      throw new ValidationError("Selecione um CSV ou Excel (.xlsx) de até 512 KB.");
    }
    const rows = extension === "xlsx"
      ? await readProcessXlsx(Buffer.from(await file.arrayBuffer()))
      : parseCsv(normalizeDelimiter(await file.text()));
    const columnNames = Array.from(new Set(rows.flatMap(Object.keys)));
    const columns = columnNames.flatMap((name) => {
      const values = rows.map((row) => row[name] ?? "").filter(Boolean);
      const looksLikeCnj = values.some((value) => parseCnj(value));
      return looksLikeCnj ? [{ name, values: values.slice(0, IMPORT_MAX), total: values.length }] : [];
    });
    if (!columns.length) throw new ValidationError("Use um cabeçalho e uma coluna com números CNJ armazenados como texto.");
    return { columns };
  });
}

export async function previewImportBatchAction(input: unknown): Promise<ActionState<{
  rows: { raw: string; number: string | null; status: "NEW" | "EXISTS" | "DUPLICATE" | "INVALID"; message: string | null }[];
  totals: { total: number; new: number; exists: number; duplicate: number; invalid: number };
}>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "cases:write");
    const parsedInput = parse(batchInputSchema, input);
    const numbers = parseNumberList(parsedInput.numbers);
    if (!numbers.length) throw new ValidationError("Cole ao menos um número.", { numbers: ["Cole ao menos um número CNJ."] });
    if (numbers.length > IMPORT_MAX) throw new ValidationError(`No máximo ${IMPORT_MAX} números por vez.`, { numbers: [`Você colou ${numbers.length}; o limite é ${IMPORT_MAX} por vez.`] });

    const existing = await db.case.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null, number: { in: numbers.filter((row) => row.status === "OK" && row.number).map((row) => row.number!) } },
      select: { number: true },
    });
    const existingNumbers = new Set(existing.map((row) => row.number));
    const rows = numbers.map((row) => {
      if (row.status === "INVALID") return { raw: row.raw, number: row.number, status: "INVALID" as const, message: row.message };
      if (row.status === "DUPLICATE") return { raw: row.raw, number: row.number, status: "DUPLICATE" as const, message: row.message };
      if (row.number && existingNumbers.has(row.number)) return { raw: row.raw, number: row.number, status: "EXISTS" as const, message: "Já cadastrado neste escritório." };
      return { raw: row.raw, number: row.number, status: "NEW" as const, message: null };
    });
    return { rows, totals: {
      total: rows.length,
      new: rows.filter((row) => row.status === "NEW").length,
      exists: rows.filter((row) => row.status === "EXISTS").length,
      duplicate: rows.filter((row) => row.status === "DUPLICATE").length,
      invalid: rows.filter((row) => row.status === "INVALID").length,
    } };
  });
}

export async function createImportBatchAction(input: unknown): Promise<ActionState<{ id: string; total: number; created: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await createImportBatch(ctx, parse(batchInputSchema, input));
    revalidatePath("/processos");
    return r;
  });
}

export async function processBatchStepAction(batchId: string): Promise<ActionState<{ remaining: number }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await processBatchStep(ctx, parse(uuidSchema, batchId));
    revalidatePath(`/processos/importar/${batchId}`);
    return r;
  });
}
