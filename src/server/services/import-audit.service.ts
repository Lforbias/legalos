import { db } from "@/lib/db/client";
import { hasLegacyCompletionNote } from "@/lib/import/astrea-map";
import { assertCan, type TenantContext } from "@/server/context";
import { taskVisibility } from "./task.service";
/** Diagnóstico somente leitura. Nota antiga pode ter sido seguida de reabertura legítima. */
export async function auditImportedTasks(ctx: TenantContext) {
  assertCan(ctx, "organization:manage");
  assertCan(ctx, "tasks:read");
  let cursor: string | undefined;
  let checked = 0;
  let candidateCount = 0;
  const candidates: { id: string; title: string; status: string; updatedAt: Date }[] = [];
  while (true) {
    const maps = await db.importMap.findMany({ where: { organizationId: ctx.organizationId, source: "astrea", entity: "task" }, select: { id: true, internalId: true }, orderBy: { id: "asc" }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!maps.length) break;
    const tasks = await db.task.findMany({ where: { AND: [{ organizationId: ctx.organizationId, id: { in: maps.map(m => m.internalId) }, deletedAt: null, status: { notIn: ["DONE", "CANCELED"] } }, taskVisibility(ctx)] }, select: { id: true, title: true, status: true, updatedAt: true, description: true } });
    checked += tasks.length;
    for (const t of tasks) if (hasLegacyCompletionNote(t.description)) {
      candidateCount++;
      if (candidates.length < 100) candidates.push({ id: t.id, title: t.title, status: t.status, updatedAt: t.updatedAt });
    }
    cursor = maps[maps.length - 1]!.id;
  }
  return { checked, candidateCount, candidates, readOnly: true as const };
}
