import { NextResponse, type NextRequest } from "next/server";
import { ValidationError } from "@/lib/permissions/check";
import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_MESSAGE } from "@/modules/cowork/constants";
import { errorResponse, isSameOrigin } from "@/server/http";
import { coworkRouteContext, NO_STORE } from "@/server/cowork/route-auth";
import { listMessages, sendMessage } from "@/server/services/cowork-message.service";

export const dynamic = "force-dynamic";

const intParam = (v: string | null) => (v !== null && /^\d{1,9}$/.test(v) ? Number(v) : undefined);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await coworkRouteContext();
    if ("error" in auth) return auth.error;
    const sp = req.nextUrl.searchParams;
    const data = await listMessages(auth.ctx, (await params).id, { before: intParam(sp.get("before")), after: intParam(sp.get("after")), limit: intParam(sp.get("limit")) });
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Envio de mensagem (JSON ou multipart com anexos). Idempotente por `clientNonce`. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    const auth = await coworkRouteContext();
    if ("error" in auth) return auth.error;
    const channelId = (await params).id;
    const type = req.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      const len = Number(req.headers.get("content-length") ?? "0");
      if (len > ATTACHMENTS_PER_MESSAGE * ATTACHMENT_MAX_BYTES + 256 * 1024) throw new ValidationError("Arquivos grandes demais para uma única mensagem.");
      const form = await req.formData();
      const payload = JSON.parse(String(form.get("payload") ?? "{}")) as Record<string, unknown>;
      const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
      if (files.length > ATTACHMENTS_PER_MESSAGE) throw new ValidationError(`Envie no máximo ${ATTACHMENTS_PER_MESSAGE} arquivos por mensagem.`);
      const uploads = [];
      for (const f of files) {
        if (f.size > ATTACHMENT_MAX_BYTES) throw new ValidationError(`O arquivo ${f.name} passa de 8 MB.`);
        uploads.push({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) });
      }
      const message = await sendMessage(auth.ctx, channelId, payload, uploads);
      return NextResponse.json({ message }, { status: 201, headers: NO_STORE });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new ValidationError("Requisição inválida.");
    const message = await sendMessage(auth.ctx, channelId, body);
    return NextResponse.json({ message }, { status: 201, headers: NO_STORE });
  } catch (err) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    return errorResponse(err);
  }
}
