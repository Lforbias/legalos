import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { toCsv } from "@/lib/reports/csv";
import { toXlsx, XLSX_MIME } from "@/lib/reports/xlsx";
import { RateLimiter } from "@/lib/security/rate-limit";
import { errorResponse } from "@/server/http";
import { exportReport, REPORT_TYPE_LIST, REPORT_TYPES, resolvePeriod, type ReportType } from "@/server/services/report.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(20, 60_000);

/** Exportação em planilha (CSV, separador `;`, UTF-8). Exige sessão, `reports:read` e a permissão do módulo; cada exportação é auditada. */
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const { ctx } = tenant;
    if (!limiter.check(ctx.userId)) return NextResponse.json({ error: "Muitas exportações. Aguarde um instante." }, { status: 429 });
    const sp = req.nextUrl.searchParams;
    const type = sp.get("tipo") as ReportType | null;
    if (!type || !REPORT_TYPE_LIST.includes(type)) return NextResponse.json({ error: "Relatório desconhecido." }, { status: 422 });
    const period = resolvePeriod(ctx, sp.get("from"), sp.get("to"));
    const { table, truncated } = await exportReport(ctx, type, period);
    if (sp.get("formato") === "xlsx") {
      const buf = await toXlsx(REPORT_TYPES[type].label, table.headers, table.rows);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "content-type": XLSX_MIME,
          "content-disposition": `attachment; filename="relatorio-${type}-${period.from}_a_${period.to}.xlsx"`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          ...(truncated ? { "x-report-truncated": "1" } : {}),
        },
      });
    }
    const body = toCsv(table.headers, table.rows);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="relatorio-${type}-${period.from}_a_${period.to}.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...(truncated ? { "x-report-truncated": "1" } : {}),
      },
    });
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message, fields: err.fieldErrors }, { status: 422 });
    return errorResponse(err);
  }
}
