import type { AuditResult, Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import type { RequestMeta } from "@/server/context";

export type AuditInput = {
  action: string;
  organizationId?: string | null;
  userId?: string | null;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  /** Nunca inclua senhas, tokens ou conteúdo de documentos. */
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
};

/** Registra um evento de auditoria. Falhas de auditoria são logadas, mas não derrubam a operação auxiliar. */
export async function audit(input: AuditInput, tx?: Tx): Promise<void> {
  try {
    await (tx ?? db).auditLog.create({
      data: {
        action: input.action,
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        result: input.result ?? "SUCCESS",
        ipAddress: input.meta?.ipAddress ?? null,
        userAgent: input.meta?.userAgent?.slice(0, 300) ?? null,
        correlationId: input.meta?.correlationId ?? null,
        metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  } catch (err) {
    logger.error("audit.write_failed", { action: input.action, error: err instanceof Error ? err.message : String(err) });
    if (tx) throw err; // dentro de transação, a trilha faz parte da atomicidade
  }
}
