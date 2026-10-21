import { NextResponse, type NextRequest } from "next/server";
import { uuidSchema } from "@/lib/validation/common";
import { getObjectStream } from "@/lib/storage/local-storage";
import { getNoteAttachmentForDownload } from "@/server/services/case-note.service";
import { errorResponse } from "@/server/http";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

/** Download autenticado de anexo de nota do processo (sempre como anexo, com nosniff). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const parsed = uuidSchema.safeParse((await params).id);
    if (!parsed.success) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
    const a = await getNoteAttachmentForDownload(tenant.ctx, parsed.data);
    const stream = await getObjectStream(a.storageKey).catch(() => null);
    if (!stream) return NextResponse.json({ error: "Arquivo indisponível no armazenamento." }, { status: 410 });
    const asciiName = a.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new NextResponse(stream, {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Length": String(a.sizeBytes),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
