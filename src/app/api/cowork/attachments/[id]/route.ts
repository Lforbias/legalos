import { NextResponse } from "next/server";
import { getObjectStream } from "@/lib/storage/local-storage";
import { errorResponse } from "@/server/http";
import { coworkRouteContext } from "@/server/cowork/route-auth";
import { getAttachmentForDownload } from "@/server/services/cowork-message.service";

export const dynamic = "force-dynamic";

/** Download autenticado: confere escritório, participação na conversa e sigilo. Sempre como anexo, com nosniff. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await coworkRouteContext();
    if ("error" in auth) return auth.error;
    const a = await getAttachmentForDownload(auth.ctx, (await params).id);
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
