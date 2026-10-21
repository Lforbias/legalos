import { NextResponse, type NextRequest } from "next/server";
import { uuidSchema } from "@/lib/validation/common";
import { RateLimiter } from "@/lib/security/rate-limit";
import { MAX_DOCUMENT_BYTES, addDocumentVersion } from "@/server/services/document.service";
import { errorResponse, isSameOrigin } from "@/server/http";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(30, 60_000);

/** Nova versão de um documento (multipart): campos `file` e `note` (opcional). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const { ctx } = tenant;
    if (!limiter.check(ctx.userId)) return NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, { status: 429 });
    const id = uuidSchema.safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_DOCUMENT_BYTES + 64 * 1024) return NextResponse.json({ error: "O tamanho máximo é 8 MB." }, { status: 413 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 422 });
    if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "O tamanho máximo é 8 MB." }, { status: 413 });
    const note = form.get("note");
    const res = await addDocumentVersion(ctx, id.data, { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }, typeof note === "string" ? note : null);
    return NextResponse.json(res, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
