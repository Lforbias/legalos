import { NextResponse, type NextRequest } from "next/server";
import { uuidSchema } from "@/lib/validation/common";
import { getObjectStream } from "@/lib/storage/local-storage";
import { getPortalDocumentForDownload } from "@/server/services/portal.service";
import { errorResponse } from "@/server/http";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

/** Download no portal: só documentos compartilhados com o cliente autenticado. Sempre como anexo. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const parsed = uuidSchema.safeParse((await params).id);
    if (!parsed.success) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    const doc = await getPortalDocumentForDownload(tenant.ctx, parsed.data);
    const stream = await getObjectStream(doc.storageKey).catch(() => null);
    if (!stream) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
    const asciiName = doc.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new NextResponse(stream, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(doc.sizeBytes),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
