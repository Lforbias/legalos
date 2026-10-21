import { NextResponse, type NextRequest } from "next/server";
import { uuidSchema } from "@/lib/validation/common";
import { RateLimiter } from "@/lib/security/rate-limit";
import { MAX_DOCUMENT_BYTES, uploadDocument } from "@/server/services/document.service";
import { errorResponse, isSameOrigin } from "@/server/http";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(30, 60_000);

/** Upload de documento (multipart): campos `file` e `caseId` OU `clientId`. */
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const { ctx } = tenant;
    if (!limiter.check(ctx.userId)) return NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, { status: 429 });

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_DOCUMENT_BYTES + 64 * 1024) return NextResponse.json({ error: "O tamanho máximo é 8 MB." }, { status: 413 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 422 });
    if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "O tamanho máximo é 8 MB." }, { status: 413 });

    const caseId = form.get("caseId");
    const clientId = form.get("clientId");
    const owner = {
      caseId: typeof caseId === "string" && caseId ? uuidSchema.parse(caseId) : null,
      clientId: typeof clientId === "string" && clientId ? uuidSchema.parse(clientId) : null,
    };
    const category = form.get("category");
    const doc = await uploadDocument(ctx, owner, { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }, { category: typeof category === "string" ? category : null });
    return NextResponse.json({ id: doc.id, name: doc.name }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") return NextResponse.json({ error: "Dados inválidos." }, { status: 422 });
    return errorResponse(err);
  }
}
