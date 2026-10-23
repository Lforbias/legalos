import { NextResponse, type NextRequest } from "next/server";
import { uuidSchema } from "@/lib/validation/common";
import { getObjectStream } from "@/lib/storage/local-storage";
import { getDocumentForDownload } from "@/server/services/document.service";
import { errorResponse } from "@/server/http";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

/** Download autenticado; prévia inline apenas para PDF/imagens passivas. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const parsed = uuidSchema.safeParse((await params).id);
    if (!parsed.success) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    const vParam = req.nextUrl.searchParams.get("v");
    const version = vParam && /^[0-9]{1,5}$/.test(vParam) ? Number(vParam) : undefined;
    const doc = await getDocumentForDownload(tenant.ctx, parsed.data, version);
    const inline = req.nextUrl.searchParams.get("inline") === "1";
    if (inline && !["application/pdf", "image/png", "image/jpeg"].includes(doc.mimeType)) return NextResponse.json({ error: "Este formato só está disponível para download." }, { status: 415 });
    const stream = await getObjectStream(doc.storageKey).catch(() => null);
    if (!stream) return NextResponse.json({ error: "Arquivo indisponível no armazenamento." }, { status: 410 });
    const asciiName = doc.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new NextResponse(stream, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(doc.sizeBytes),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": inline ? "SAMEORIGIN" : "DENY",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
