import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { getTenant } from "@/server/session";
import { exportCalculation } from "@/server/services/calculation.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const t = await getTenant();
    if (!t) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Cálculo não encontrado." }, { status: 404 });
    const f = new URL(req.url).searchParams.get("formato");
    const format = f === "csv" || f === "txt" ? f : "xlsx";
    const r = await exportCalculation(t.ctx, id, format);
    return new NextResponse(new Uint8Array(r.body), { headers: { "content-type": r.type, "content-disposition": `attachment; filename="${r.name}"`, "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
