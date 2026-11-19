import { db } from "@/lib/db/client";
import { ValidationError } from "@/lib/permissions/check";
import { BULK_MAX_FILES, buildBulkIndex, matchBulkPath, type BulkMatch } from "@/lib/documents/bulk-match";
import { assertCan, can, type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";
import { deleteDocument } from "./document.service";
import { getEntitlements, getUsage } from "./plan.service";

export type BulkPlanInput = { path: string; sha256: string; size: number }[];
export type BulkDuplicate = { documentId: string; name: string; where: string };
export type BulkPlanRow = BulkMatch & { duplicate: BulkDuplicate | null };
export type BulkPlan = { rows: BulkPlanRow[]; storage: { usedBytes: number; limitBytes: number | null } };

/** Janela em que um envio em lote ainda pode ser desfeito pela própria pessoa. */
export const BULK_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Prepara o envio em lote: sugere processo/cliente de cada arquivo (só entre os que a pessoa pode ver) e
 * aponta arquivos idênticos (mesmo SHA-256) que já estão no escritório. Não grava nada.
 */
export async function planBulkUpload(ctx: TenantContext, files: BulkPlanInput): Promise<BulkPlan> {
  assertCan(ctx, "documents:write");
  if (files.length === 0) throw new ValidationError("Selecione ao menos um arquivo.");
  if (files.length > BULK_MAX_FILES) throw new ValidationError(`Envie no máximo ${BULK_MAX_FILES} arquivos por vez.`);
  const canCases = can(ctx, "cases:read");
  const canClients = can(ctx, "clients:read");

  const [cases, clients] = await Promise.all([
    canCases
      ? db.case.findMany({ where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, number: { not: null } }, caseVisibility(ctx)] }, select: { id: true, number: true, title: true } })
      : [],
    canClients ? db.client.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, document: true } }) : [],
  ]);
  const index = buildBulkIndex({ cases, clients });

  const hashes = [...new Set(files.map((f) => f.sha256))];
  const existing = await db.document.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, sha256: { in: hashes } }, { OR: [{ caseId: null }, { case: { is: caseVisibility(ctx) } }] }] },
    select: { id: true, name: true, sha256: true, case: { select: { number: true, title: true } }, client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const byHash = new Map<string, BulkDuplicate>();
  for (const d of existing) {
    if (byHash.has(d.sha256)) continue;
    const where = d.case ? `processo ${d.case.number ?? d.case.title}` : d.client ? `cliente ${d.client.name}` : "documentos";
    byHash.set(d.sha256, { documentId: d.id, name: d.name, where });
  }

  const [ent, usage] = await Promise.all([getEntitlements(ctx.organizationId), getUsage(ctx.organizationId)]);
  return {
    rows: files.map((f) => ({ ...matchBulkPath(f.path, index), duplicate: byHash.get(f.sha256) ?? null })),
    storage: { usedBytes: usage.storageBytes, limitBytes: ent.limits.maxStorageMb == null ? null : ent.limits.maxStorageMb * 1024 * 1024 },
  };
}

/** Processos visíveis de um cliente, para a pessoa trocar o vínculo de um arquivo. */
export async function listClientCasesForBulk(ctx: TenantContext, clientId: string) {
  assertCan(ctx, "cases:read");
  return db.case.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, parties: { some: { clientId } } }, caseVisibility(ctx)] },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, number: true, title: true },
  });
}

/**
 * Desfaz um envio em lote: exclui (lixeira lógica) só documentos enviados pela própria pessoa nas últimas 24 h
 * e que continuam na versão 1. Os demais são ignorados e contados como "mantidos".
 */
export async function undoBulkUpload(ctx: TenantContext, ids: string[]) {
  assertCan(ctx, "documents:write");
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { removed: 0, kept: 0 };
  if (unique.length > BULK_MAX_FILES) throw new ValidationError(`No máximo ${BULK_MAX_FILES} documentos por vez.`);
  const since = new Date(Date.now() - BULK_UNDO_WINDOW_MS);
  const eligible = await db.document.findMany({
    where: { id: { in: unique }, organizationId: ctx.organizationId, uploadedById: ctx.userId, deletedAt: null, currentVersion: 1, createdAt: { gte: since } },
    select: { id: true },
  });
  let removed = 0;
  for (const d of eligible) {
    try {
      await deleteDocument(ctx, d.id);
      removed++;
    } catch {
      // vinculado a petição, já removido em paralelo etc.: fica mantido
    }
  }
  return { removed, kept: unique.length - removed };
}
