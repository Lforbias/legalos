import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { toCsv } from "@/lib/reports/csv";
import { toXlsx, XLSX_MIME } from "@/lib/reports/xlsx";
import { RateLimiter } from "@/lib/security/rate-limit";
import { errorResponse } from "@/server/http";
import { EXPORT_KINDS, exportList, isExportKind, recordExport } from "@/server/services/export.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(10, 60_000);

/** Exportação geral das listas em Excel (padrão) ou CSV. Exige sessão e a permissão do módulo; cada exportação é auditada. */
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const { ctx } = tenant;
    if (!limiter.check(ctx.userId)) return NextResponse.json({ error: "Muitas exportações. Aguarde um instante." }, { status: 429 });
    const sp = req.nextUrl.searchParams;
    const kind = sp.get("tipo");
    if (!isExportKind(kind)) return NextResponse.json({ error: "Exportação desconhecida." }, { status: 422 });
    const format = sp.get("formato") === "csv" ? "csv" : "xlsx";
    const t = await exportList(ctx, kind);
    await recordExport(ctx, kind, t.rows.length, format);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${kind}-${stamp}`;
    const common = { "cache-control": "no-store", "x-content-type-options": "nosniff", ...(t.truncated ? { "x-export-truncated": "1" } : {}) };
    if (format === "csv") {
      return new NextResponse(toCsv(t.headers, t.rows), { status: 200, headers: { ...common, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${base}.csv"` } });
    }
    const buf = await toXlsx(EXPORT_KINDS[kind].label, t.headers, t.rows);
    return new NextResponse(new Uint8Array(buf), { status: 200, headers: { ...common, "content-type": XLSX_MIME, "content-disposition": `attachment; filename="${base}.xlsx"` } });
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message, fields: err.fieldErrors }, { status: 422 });
    return errorResponse(err);
  }
}
