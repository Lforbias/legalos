import { NextResponse, type NextRequest } from "next/server";
import { RateLimiter } from "@/lib/security/rate-limit";
import { searchClientsForSelect } from "@/server/services/client.service";
import { errorResponse } from "@/server/http";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(120, 60_000);

/** Autocompletar de clientes (seletor em formulários). Restrito ao escritório e a clients:read. */
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!limiter.check(tenant.ctx.userId)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const items = await searchClientsForSelect(tenant.ctx, q);
    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
