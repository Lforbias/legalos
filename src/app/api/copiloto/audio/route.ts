import { NextResponse, type NextRequest } from "next/server";
import { RateLimiter } from "@/lib/security/rate-limit";
import { errorResponse, isSameOrigin } from "@/server/http";
import { getTenant } from "@/server/session";
import { MAX_AUDIO, transcribeAudio } from "@/server/services/service-session.service";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(10, 60_000);

/** Copiloto: recebe um áudio (campo `file`) e devolve o texto. O áudio não é guardado. */
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    if (!limiter.check(tenant.ctx.userId)) return NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, { status: 429 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_AUDIO + 64 * 1024) return NextResponse.json({ error: "O áudio deve ter até 10 MB." }, { status: 413 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um áudio." }, { status: 422 });
    const r = await transcribeAudio(tenant.ctx, { mime: file.type, data: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json(r);
  } catch (err) {
    return errorResponse(err);
  }
}
