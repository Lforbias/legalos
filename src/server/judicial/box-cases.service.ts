import { db } from "@/lib/db/client";
import type { TenantContext } from "@/server/context";
import { visibility } from "@/server/services/notice.service";

export type BoxCaseRow = { caseId: string; number: string | null; title: string; court: string | null; communications: number; notViewed: number; lastAt: Date };
export type PendingMatchRow = { noticeId: string; title: string; caseNumber: string | null; state: "AMBIGUOUS" | "NOT_FOUND"; courtCode: string | null; capturedAt: Date };

/**
 * Processos que já apareceram em comunicações do Box, com o que ainda não foi visto, e as comunicações cujo processo
 * não pôde ser vinculado sozinho (mais de um processo com o mesmo número ou nenhum): essas pedem confirmação manual.
 * Respeita o sigilo: só processos que o usuário pode ver.
 */
export async function getBoxCases(ctx: TenantContext, take = 50): Promise<{ cases: BoxCaseRow[]; pending: PendingMatchRow[]; pendingTotal: number }> {
  const org = ctx.organizationId;
  const base = [{ organizationId: org, deletedAt: null, status: { not: "DISCARDED" as const } }, visibility(ctx)];
  const linked = { AND: [...base, { caseId: { not: null } }] };
  const [totals, unseen, pending, pendingTotal] = await Promise.all([
    db.courtNotice.groupBy({ by: ["caseId"], where: linked, _count: { _all: true }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, take }),
    db.courtNotice.groupBy({ by: ["caseId"], where: { AND: [...base, { caseId: { not: null } }, { firstViewedAt: null }] }, _count: { _all: true } }),
    db.courtNotice.findMany({ where: { AND: [...base, { caseId: null, caseMatchState: { in: ["AMBIGUOUS", "NOT_FOUND"] } }] }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, caseNumber: true, caseMatchState: true, courtCode: true, capturedAt: true, createdAt: true } }),
    db.courtNotice.count({ where: { AND: [...base, { caseId: null, caseMatchState: { in: ["AMBIGUOUS", "NOT_FOUND"] } }] } }),
  ]);
  const ids = totals.map((t) => t.caseId).filter((x): x is string => x !== null);
  const cases = ids.length ? await db.case.findMany({ where: { id: { in: ids }, organizationId: org, deletedAt: null }, select: { id: true, number: true, title: true, court: true } }) : [];
  const byId = new Map(cases.map((c) => [c.id, c]));
  const unseenBy = new Map(unseen.map((u) => [u.caseId, u._count._all]));
  return {
    cases: totals.flatMap((t) => {
      const c = t.caseId ? byId.get(t.caseId) : undefined;
      return c && t._max.createdAt ? [{ caseId: c.id, number: c.number, title: c.title, court: c.court, communications: t._count._all, notViewed: unseenBy.get(t.caseId) ?? 0, lastAt: t._max.createdAt }] : [];
    }),
    pending: pending.map((n) => ({ noticeId: n.id, title: n.title, caseNumber: n.caseNumber, state: n.caseMatchState as "AMBIGUOUS" | "NOT_FOUND", courtCode: n.courtCode, capturedAt: n.capturedAt ?? n.createdAt })),
    pendingTotal,
  };
}
