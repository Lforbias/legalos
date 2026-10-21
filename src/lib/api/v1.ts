import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logging/logger";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/permissions/check";
import { limiters } from "@/lib/security/rate-limit";
import { toFieldErrors } from "@/lib/validation/common";
import { authenticateApiKey, type ApiPrincipal, type ApiScope } from "@/server/services/apikey.service";

const MAX_BODY = 256 * 1024;
const BASE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

export function jsonOk(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...BASE_HEADERS, ...extra } });
}
export function jsonError(status: number, code: string, message: string, fields?: Record<string, string[] | undefined>, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status, headers: { ...BASE_HEADERS, ...extra } });
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function mapError(e: unknown, correlationId: string): NextResponse {
  if (e instanceof ZodError) return jsonError(422, "validation_error", "Dados inválidos.", toFieldErrors(e));
  if (e instanceof ValidationError) return jsonError(422, "validation_error", e.message, e.fieldErrors);
  if (e instanceof NotFoundError) return jsonError(404, "not_found", e.message);
  if (e instanceof ForbiddenError) return jsonError(403, "forbidden", e.message);
  if (e instanceof ConflictError) return jsonError(409, "conflict", e.message);
  if (e instanceof UnauthorizedError) return jsonError(401, "unauthorized", e.message);
  logger.error("api.v1.unhandled", { correlationId, error: e instanceof Error ? e.message : String(e) });
  return jsonError(500, "internal_error", `Erro interno. Informe a referência ${correlationId}.`);
}

export type V1Handler<P> = (a: { principal: PrincipalWithCtx; req: Request; params: P; url: URL; body: () => Promise<Record<string, unknown>> }) => Promise<NextResponse>;
type PrincipalWithCtx = ApiPrincipal;

/** Envolve uma rota da API v1: autenticação por chave, escopo, limite de taxa, parsing de corpo e mapeamento de erros. */
export function v1Route<P = Record<string, never>>(scope: ApiScope | null, handler: V1Handler<P>) {
  return async (req: Request, routeCtx?: { params: Promise<P> }): Promise<NextResponse> => {
    const correlationId = crypto.randomUUID().slice(0, 8);
    const ip = clientIp(req);
    try {
      const header = req.headers.get("authorization") ?? "";
      const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
      const principal = token ? await authenticateApiKey(token, { ipAddress: ip, userAgent: req.headers.get("user-agent"), correlationId }) : null;
      if (!principal) {
        if (!limiters.apiAuthFail.check(`fail:${ip}`)) return jsonError(429, "rate_limited", "Muitas tentativas inválidas. Aguarde um minuto.", undefined, { "Retry-After": "60" });
        return jsonError(401, "unauthorized", "Chave de API ausente, inválida, expirada ou revogada.", undefined, { "WWW-Authenticate": "Bearer" });
      }
      if (!limiters.apiKey.check(`key:${principal.keyId}`)) return jsonError(429, "rate_limited", "Limite de requisições excedido (120 por minuto).", undefined, { "Retry-After": "60" });
      if (scope && !principal.scopes.has(scope)) return jsonError(403, "insufficient_scope", `Esta chave não tem o acesso necessário: ${scope}.`);
      const params = (routeCtx?.params ? await routeCtx.params : {}) as P;
      const url = new URL(req.url);
      const body = async () => {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.toLowerCase().includes("application/json")) throw new ValidationError("Envie o corpo como application/json.");
        const len = Number(req.headers.get("content-length") ?? "0");
        if (len > MAX_BODY) throw new ValidationError("Corpo grande demais (máximo de 256 KB).");
        const text = await req.text();
        if (text.length > MAX_BODY) throw new ValidationError("Corpo grande demais (máximo de 256 KB).");
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new ValidationError("JSON inválido.");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ValidationError("O corpo deve ser um objeto JSON.");
        return parsed as Record<string, unknown>;
      };
      return await handler({ principal, req, params, url, body });
    } catch (e) {
      return mapError(e, correlationId);
    }
  };
}

export const queryOf = (url: URL): Record<string, string | undefined> => Object.fromEntries(url.searchParams.entries());
