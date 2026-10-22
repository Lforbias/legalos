import { NextResponse } from "next/server";
import { limiters } from "@/lib/security/rate-limit";
import { exchangeCode, OAuthError, refreshTokens } from "@/server/services/mcp-auth.service";

export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store", Pragma: "no-cache", "Access-Control-Allow-Origin": "*" } as const;
const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
const fail = (status: number, error: string, error_description: string) => NextResponse.json({ error, error_description }, { status, headers: H });

export async function POST(req: Request) {
  if (!limiters.oauth.check(`tok:${ip(req)}`)) return fail(429, "invalid_request", "Muitas requisições.");
  const raw = await req.text();
  if (raw.length > 10_000) return fail(400, "invalid_request", "Corpo grande demais.");
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  let f: Record<string, string> = {};
  try {
    if (ct.includes("application/json")) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      f = Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } else f = Object.fromEntries(new URLSearchParams(raw).entries());
  } catch {
    return fail(400, "invalid_request", "Corpo inválido.");
  }
  try {
    if (f.grant_type === "authorization_code") {
      if (!f.code || !f.client_id || !f.redirect_uri || !f.code_verifier) return fail(400, "invalid_request", "Faltam parâmetros.");
      return NextResponse.json(await exchangeCode({ code: f.code, clientId: f.client_id, redirectUri: f.redirect_uri, codeVerifier: f.code_verifier }), { headers: H });
    }
    if (f.grant_type === "refresh_token") {
      if (!f.refresh_token || !f.client_id) return fail(400, "invalid_request", "Faltam parâmetros.");
      return NextResponse.json(await refreshTokens({ refreshToken: f.refresh_token, clientId: f.client_id }), { headers: H });
    }
    return fail(400, "unsupported_grant_type", "grant_type não suportado.");
  } catch (e) {
    if (e instanceof OAuthError) return fail(e.code === "invalid_client" ? 401 : 400, e.code, e.message);
    throw e;
  }
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: { ...H, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
