import "server-only";
import { ZodError, type ZodType } from "zod";
import { logger } from "@/lib/logging/logger";
import { toFieldErrors, type ActionState } from "@/lib/validation/common";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/permissions/check";
import { recordAppError } from "@/server/job-runs";
import { getRequestMeta } from "@/server/session";

/** Converte exceções de domínio em respostas de formulário; erros inesperados são logados e mascarados. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionState<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ZodError) return { ok: false, message: "Corrija os campos destacados.", fieldErrors: toFieldErrors(err) };
    if (err instanceof ValidationError) return { ok: false, message: err.message, fieldErrors: err.fieldErrors };
    if (
      err instanceof ForbiddenError ||
      err instanceof NotFoundError ||
      err instanceof ConflictError ||
      err instanceof UnauthorizedError
    ) {
      return { ok: false, message: err.message };
    }
    const meta = await getRequestMeta().catch(() => ({ correlationId: null }));
    logger.error("action.unexpected_error", {
      correlationId: meta.correlationId,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 6).join("\n") : undefined,
    });
    await recordAppError("ação", err, meta.correlationId);
    // Fora de produção, exibe a causa real para acelerar o diagnóstico (nunca em produção).
    const devDetail = process.env.NODE_ENV !== "production" && err instanceof Error ? ` [dev: ${err.name}: ${err.message.slice(0, 300)}]` : "";
    return {
      ok: false,
      message: `Não foi possível concluir a operação. Tente novamente.${meta.correlationId ? ` (ref. ${meta.correlationId.slice(0, 8)})` : ""}${devDetail}`,
    };
  }
}

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  return schema.parse(input);
}

export { safeNext } from "@/lib/security/safe-next";
