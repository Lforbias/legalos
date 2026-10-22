import { NextResponse } from "next/server";
import { limiters } from "@/lib/security/rate-limit";
import { OAuthError, registerClient } from "@/server/services/mcp-auth.service";

export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } as const;
const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

/** Registro dinâmico de cliente (RFC 7591). Cliente público: sem segredo, sempre com PKCE. */
export async function POST(req: Request) {
  if (!limiters.oauth.check(`reg:${ip(req)}`)) return NextResponse.json({ error: "invalid_request", error_description: "Muitas requisições." }, { status: 429, headers: H });
  const text = await req.text();
  let body: Record<string, unknown>;
  try {
    const j = text.length > 20_000 ? null : JSON.parse(text);
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("x");
    body = j as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "JSON inválido." }, { status: 400, headers: H });
  }
  try {
    const c = await registerClient(body);
    return NextResponse.json({ client_id: c.clientId, client_name: c.name, redirect_uris: c.redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000) }, { status: 201, headers: H });
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json({ error: e.code, error_description: e.message }, { status: 400, headers: H });
    throw e;
  }
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: { ...H, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
