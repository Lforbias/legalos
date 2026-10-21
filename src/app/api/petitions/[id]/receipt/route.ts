import { NextResponse, type NextRequest } from "next/server";
import { uuidSchema } from "@/lib/validation/common";
import { getReceipt } from "@/server/services/petition-queue.service";
import { errorResponse } from "@/server/http";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

/** Recibo do protocolo em texto (sempre como anexo). Respeita sigilo e escritório. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const parsed = uuidSchema.safeParse((await params).id);
    if (!parsed.success) return NextResponse.json({ error: "Recibo não encontrado." }, { status: 404 });
    const p = await getReceipt(tenant.ctx, parsed.data);
    const name = `recibo-${(p.protocol ?? "protocolo").replace(/[^A-Za-z0-9._-]/g, "_")}.txt`;
    return new NextResponse(p.receipt, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
