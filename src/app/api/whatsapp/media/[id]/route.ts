import { NextResponse, type NextRequest } from "next/server";
import { getObjectStream } from "@/lib/storage/local-storage";
import { uuidSchema } from "@/lib/validation/common";
import { errorResponse } from "@/server/http";
import { getTenant } from "@/server/session";
import { getMessageMedia } from "@/server/services/whatsapp.service";

export const dynamic = "force-dynamic";

/** Só estes tipos abrem no navegador; todo o resto é baixado como anexo (o conteúdo vem de terceiros). */
const INLINE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "video/mp4"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const parsed = uuidSchema.safeParse((await params).id);
    if (!parsed.success) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    const f = await getMessageMedia(tenant.ctx, parsed.data);
    const stream = await getObjectStream(f.key).catch(() => null);
    if (!stream) return NextResponse.json({ error: "Arquivo indisponível no armazenamento." }, { status: 410 });
    const inline = INLINE.has(f.mime);
    const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new NextResponse(stream, {
      headers: {
        "Content-Type": inline ? f.mime : "application/octet-stream",
        ...(f.size ? { "Content-Length": String(f.size) } : {}),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
