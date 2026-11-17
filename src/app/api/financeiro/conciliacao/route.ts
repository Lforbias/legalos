import { errorResponse, isSameOrigin } from "@/server/http";
import { getTenant } from "@/server/session";
import { parse } from "@/server/action-helpers";
import { uuidSchema } from "@/lib/validation/common";
import { z } from "zod";
import { ValidationError } from "@/lib/permissions/check";
import { importStatementCsv } from "@/server/services/bank-reconciliation.service";
import type { StatementMapping } from "@/lib/finance/statement-csv";

export const runtime = "nodejs";

const mappingSchema = z.object({
  date: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(200),
  amount: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(200).optional(),
  direction: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem não permitida." }, { status: 403 });
  const tenant = await getTenant();
  if (!tenant) return Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size < 1 || file.size > 8 * 1024 * 1024) throw new ValidationError("Selecione um CSV de até 8 MB.");
    const accountId = parse(uuidSchema, form.get("accountId"));
    const mapping = parse(mappingSchema, {
      date: form.get("date"), description: form.get("description"), amount: form.get("amount"),
      reference: form.get("reference") || undefined, direction: form.get("direction") || undefined,
    }) as StatementMapping;
    const result = await importStatementCsv(tenant.ctx, { accountId, fileName: file.name, content: await file.text(), mapping });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
