import { NextResponse } from "next/server";
import { logger } from "@/lib/logging/logger";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/permissions/check";

/** Converte erros de domínio em respostas HTTP JSON (para route handlers). Erros inesperados são logados e mascarados. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof ConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
  if (err instanceof ValidationError) return NextResponse.json({ error: err.message, fieldErrors: err.fieldErrors }, { status: 422 });
  logger.error("route.unexpected_error", { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  return NextResponse.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}

/** Defesa adicional contra CSRF em POST: o cabeçalho Origin, quando presente, deve ser o mesmo host da requisição. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // navegadores sempre enviam Origin em POST cross-site; ausência = cliente não-navegador
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
