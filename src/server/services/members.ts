import { db } from "@/lib/db/client";
import type { TenantContext } from "@/server/context";

/** Membros ativos do escritório (para seletores de responsável). */
export async function listActiveMembers(ctx: TenantContext) {
  const rows = await db.membership.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE" },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => r.user);
}

export async function userNames(ctx: TenantContext, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = await db.user.findMany({ where: { id: { in: unique }, memberships: { some: { organizationId: ctx.organizationId } } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}
