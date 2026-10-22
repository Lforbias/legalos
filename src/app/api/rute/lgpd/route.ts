import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { lgpdCsv } from "@/server/services/rute-governance.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t = await getTenant();
  if (!t) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const month = new URL(req.url).searchParams.get("mes") ?? undefined;
  try {
    const r = await lgpdCsv(t.ctx, month && /^\d{4}-\d{2}$/.test(month) ? month : undefined);
    return new NextResponse(r.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${r.filename}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
