import { NextResponse, type NextRequest } from "next/server";
import { RateLimiter } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation/common";
import { errorResponse, isSameOrigin } from "@/server/http";
import { getTenant } from "@/server/session";
import { sendFile } from "@/server/services/whatsapp.service";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(20, 60_000);
const MAX = 16 * 1024 * 1024;

/** Envio de arquivo (multipart): campos `file` e `caption` (opcional). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    if (!limiter.check(tenant.ctx.userId)) return NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, { status: 429 });
    const id = uuidSchema.safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX + 64 * 1024) return NextResponse.json({ error: "O tamanho máximo é 16 MB." }, { status: 413 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 422 });
    if (file.size > MAX) return NextResponse.json({ error: "O tamanho máximo é 16 MB." }, { status: 413 });
    const caption = form.get("caption");
    const r = await sendFile(tenant.ctx, id.data, { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }, typeof caption === "string" ? caption : null);
    return NextResponse.json(r, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
