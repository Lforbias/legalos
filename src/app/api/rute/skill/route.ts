import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { buildSkillPackage } from "@/server/services/rute-library.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

/** Baixa o pacote de skill do escritório (.zip) para enviar ao Claude. Só quem edita o escritório. */
export async function GET() {
  const t = await getTenant();
  if (!t) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    const r = await buildSkillPackage(t.ctx);
    return new NextResponse(new Uint8Array(r.buffer), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${r.filename}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
