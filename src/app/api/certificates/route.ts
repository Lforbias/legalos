import { NextResponse, type NextRequest } from "next/server";
import { RateLimiter } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation/common";
import { MAX_PFX_BYTES, uploadCertificate } from "@/server/services/certificate.service";
import { errorResponse, isSameOrigin } from "@/server/http";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(10, 60_000);

/** Envio de certificado A1 (multipart): `file`, `password`, `label`, `ownerUserId`. A senha nunca é registrada em log. */
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const { ctx } = tenant;
    if (!limiter.check(ctx.userId)) return NextResponse.json({ error: "Muitas tentativas. Aguarde um instante." }, { status: 429 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_PFX_BYTES + 16 * 1024) return NextResponse.json({ error: "Arquivo grande demais." }, { status: 413 });

    const form = await req.formData();
    const file = form.get("file");
    const password = form.get("password");
    const label = form.get("label");
    const ownerUserId = form.get("ownerUserId");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione o arquivo do certificado (.pfx ou .p12).", fieldErrors: { file: ["Obrigatório."] } }, { status: 422 });
    const c = await uploadCertificate(ctx, {
      file: Buffer.from(await file.arrayBuffer()),
      password: typeof password === "string" ? password : "",
      label: typeof label === "string" ? label : "",
      ownerUserId: uuidSchema.parse(typeof ownerUserId === "string" ? ownerUserId : ""),
    });
    return NextResponse.json({ id: c.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") return NextResponse.json({ error: "Dados inválidos." }, { status: 422 });
    return errorResponse(err);
  }
}
