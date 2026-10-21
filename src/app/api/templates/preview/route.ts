import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/server/http";
import { previewTemplatePdf } from "@/server/services/template.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

const query = z.object({
  modelo: z.uuid(),
  processo: z.uuid().optional(),
  cliente: z.uuid().optional(),
  titulo: z.string().trim().max(120).optional(),
  timbrado: z.union([z.uuid(), z.literal("none"), z.literal("")]).optional(),
});

/** Prévia em PDF (inline) do documento que seria gerado. Nada é gravado. */
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = query.safeParse(sp);
    if (!q.success) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    const { pdf, title } = await previewTemplatePdf(tenant.ctx, q.data.modelo, { caseId: q.data.processo ?? null, clientId: q.data.cliente ?? null }, q.data.titulo ?? "", q.data.timbrado || null);
    const ascii = title.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="previa-${ascii}.pdf"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
