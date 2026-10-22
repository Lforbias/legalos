import { NextResponse, type NextRequest } from "next/server";
import { RateLimiter } from "@/lib/security/rate-limit";
import { errorResponse, isSameOrigin } from "@/server/http";
import { getTenant } from "@/server/session";
import { addLibraryFile } from "@/server/services/chat-tools.service";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(20, 60_000);
const MAX = 16 * 1024 * 1024;

/** Biblioteca de arquivos do Chat (multipart): campos `title` e `file`. Exige gerenciar o Chat. */
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    if (!limiter.check(tenant.ctx.userId)) return NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, { status: 429 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX + 64 * 1024) return NextResponse.json({ error: "O tamanho máximo é 16 MB." }, { status: 413 });
    const form = await req.formData();
    const file = form.get("file");
    const title = form.get("title");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 422 });
    if (file.size > MAX) return NextResponse.json({ error: "O tamanho máximo é 16 MB." }, { status: 413 });
    const r = await addLibraryFile(tenant.ctx, { title: typeof title === "string" ? title : "", file: { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) } });
    return NextResponse.json(r, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
