import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { ymdRange } from "@/lib/dates/range";
import { RateLimiter } from "@/lib/security/rate-limit";
import { errorResponse } from "@/server/http";
import { exportAllCsv, exportConversationCsv } from "@/server/services/chat-report.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(10, 60_000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exporta conversas do Chat em CSV. `?c=<id>` = uma conversa (quem lê o Chat); `?from=&to=` = período inteiro (somente gestão). Tudo auditado. */
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const { ctx } = tenant;
    if (!limiter.check(ctx.userId)) return NextResponse.json({ error: "Muitas exportações. Aguarde um instante." }, { status: 429 });
    const sp = req.nextUrl.searchParams;
    const c = sp.get("c");
    let out;
    if (c) {
      if (!UUID.test(c)) return NextResponse.json({ error: "Conversa inválida." }, { status: 422 });
      out = await exportConversationCsv(ctx, c);
    } else {
      const range = ymdRange(sp.get("from"), sp.get("to"));
      if (!range) return NextResponse.json({ error: "Informe o período (AAAA-MM-DD)." }, { status: 422 });
      const acc = sp.get("num");
      out = await exportAllCsv(ctx, range, acc && UUID.test(acc) ? acc : null);
    }
    return new NextResponse(out.csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${out.filename}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message, fields: err.fieldErrors }, { status: 422 });
    return errorResponse(err);
  }
}
