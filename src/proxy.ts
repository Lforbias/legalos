import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { BOX_AVAILABLE, BOX_UNAVAILABLE_MESSAGE, isBoxPath } from "@/lib/box-retirement";
import { liveKitCspOrigins } from "@/server/cowork/livekit";
import { THEME_SCRIPT_CSP_HASH } from "@/lib/theme-script";

// /api/cron e /api/v1 não usam cookie de sessão: autenticam por conta própria (segredo do agendador / chave de API).
const PUBLIC_PREFIXES = ["/blog", "/ferramentas", "/comunidade", "/acesso", "/minha-conta", "/transparencia", "/sair-das-novidades", "/api/audience", "/sitemap.xml", "/robots.txt", "/brand", "/inicio", "/produto", "/apresentacao", "/login", "/register", "/forgot-password", "/reset-password", "/accept-invite", "/verify-email", "/api/health", "/api/ready", "/api/cron", "/api/v1", "/api/mcp", "/api/oauth", "/.well-known", "/api/billing/asaas/webhook", "/api/webhooks/fees", "/api/whatsapp/webhook", "/api/cowork/livekit/webhook"];

/**
 * Proxy (middleware do Next 16): correlation id + redirecionamento rápido de visitantes sem cookie.
 * ATENÇÃO: a presença do cookie NÃO autentica ninguém. A validação real da sessão acontece no servidor
 * (getSession/requireTenant) em cada página e Server Action.
 */
const isProd = process.env.NODE_ENV === "production";

/** CSP com nonce por requisição (o Next aplica o nonce aos próprios scripts) e o hash do script de tema. Sem scripts de terceiros. */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${THEME_SCRIPT_CSP_HASH} 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self' data:",
    `connect-src 'self'${liveKitCspOrigins().map((o) => ` ${o}`).join("")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const nonce = btoa(crypto.randomUUID());
  const preview = /^\/api\/documents\/[0-9a-f-]{36}$/i.test(request.nextUrl.pathname) && request.nextUrl.searchParams.get("inline") === "1";
  const csp = preview ? "default-src 'none'; frame-ancestors 'self'" : buildCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const { pathname, search } = request.nextUrl;
  if (!BOX_AVAILABLE && isBoxPath(pathname)) {
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: { code: "box_removed", message: BOX_UNAVAILABLE_MESSAGE } }, { status: 410 })
      : new NextResponse(BOX_UNAVAILABLE_MESSAGE, { status: 404 });
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }
  // A raiz apresenta o produto para visitantes e usuários autenticados.
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/produto";
    const res = NextResponse.rewrite(url, { request: { headers } });
    res.headers.set("x-request-id", requestId);
    res.headers.set("content-security-policy", csp);
    return res;
  }
  const isLocalInboxPreview = process.env.NODE_ENV === "development" && pathname === "/preview/caixa-entrada";
  const isPublic = isLocalInboxPreview || pathname === "/api/webhooks/legalmail" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isPublic && !preview && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    res.headers.set("content-security-policy", csp);
    return res;
  }

  const res = NextResponse.next({ request: { headers } });
  if (!isPublic && !pathname.startsWith("/api/") && request.cookies.has(SESSION_COOKIE)) {
    // Câmera e tela só no Cowork (onde ficam as reuniões), e só quando a videoconferência está habilitada.
    // Vale para o documento inteiro: a navegação interna do Next mantém a política da página em que o documento abriu.
    const video = (pathname === "/cowork" || pathname.startsWith("/cowork/")) && liveKitCspOrigins().length > 0;
    res.headers.set("permissions-policy", video ? "camera=(self), microphone=(self), display-capture=(self), geolocation=()" : "camera=(), microphone=(self), geolocation=()");
  }
  res.headers.set("x-request-id", requestId);
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  matcher: ["/((?!api/importacoes/astrea$|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|offline.html|pwa/).*)"],
};
