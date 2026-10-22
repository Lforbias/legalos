import { NextResponse } from "next/server";
import { originAllowed, resourceMetadataUrl } from "@/lib/mcp/http";
import { handleRpc, type RpcRequest, type RpcResponse } from "@/lib/mcp/protocol";
import { limiters } from "@/lib/security/rate-limit";
import { ConflictError } from "@/lib/permissions/check";
import { authenticateMcpBearer } from "@/server/services/mcp-auth.service";
import { assertRuteOn } from "@/server/services/rute-settings.service";

export const dynamic = "force-dynamic";
const MAX_BODY = 256 * 1024;
const H = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;
const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
const rpcError = (status: number, code: number, message: string, extra: Record<string, string> = {}) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers: { ...H, ...extra } });

export async function POST(req: Request) {
  if (!originAllowed(req.headers.get("origin"))) return rpcError(403, -32000, "Origem não permitida.");
  const addr = ip(req);
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const principal = token ? await authenticateMcpBearer(token, { ipAddress: addr, userAgent: req.headers.get("user-agent") }) : null;
  if (!principal) {
    if (!limiters.apiAuthFail.check(`mcp-fail:${addr}`)) return rpcError(429, -32000, "Muitas tentativas inválidas.", { "Retry-After": "60" });
    return rpcError(401, -32001, "Autorização necessária.", { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl()}"` });
  }
  if (!limiters.mcp.check(`mcp:${principal.id}`)) return rpcError(429, -32000, "Limite de requisições excedido.", { "Retry-After": "60" });
  try {
    await assertRuteOn(principal.ctx.organizationId, "mcp");
  } catch (e) {
    return rpcError(403, -32002, e instanceof ConflictError ? e.message : "RUTE indisponível.");
  }
  const text = await req.text();
  if (text.length > MAX_BODY) return rpcError(413, -32600, "Corpo grande demais.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return rpcError(400, -32700, "JSON inválido.");
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0 || parsed.length > 20) return rpcError(400, -32600, "Lote inválido.");
    const out: RpcResponse[] = [];
    for (const m of parsed) {
      const r = await handleRpc(principal, m as RpcRequest);
      if (r) out.push(r);
    }
    return out.length ? NextResponse.json(out, { headers: H }) : new NextResponse(null, { status: 202, headers: H });
  }
  const r = await handleRpc(principal, parsed as RpcRequest);
  return r ? NextResponse.json(r, { headers: H }) : new NextResponse(null, { status: 202, headers: H });
}

const notAllowed = () => new NextResponse(null, { status: 405, headers: { ...H, Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
