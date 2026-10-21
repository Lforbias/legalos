import { db } from "@/lib/db/client";
import { addDays, todayYmd } from "@/lib/dates/ymd";
import { utcToZoned } from "@/lib/dates/zoned";
import { can, type TenantContext } from "@/server/context";
import { caseVisibility } from "./case.service";
import { noticeBoxCounts, visibility } from "./notice.service";

/** Quantas intimações aguardam distribuição (alternador Func/Box). Respeita sigilo; falha vira 0 no chamador. */
export async function countNewNotices(ctx: TenantContext): Promise<number> {
  if (!can(ctx, "inbox:read")) return 0;
  const { entrada } = await noticeBoxCounts(ctx);
  return entrada;
}

export type BoxDashboard = {
  notices: {
    boxes: { entrada: number; minhas: number; geral: number; adormecidas: number; acervo: number };
    stale: number;
    bySource: { imported: number; manual: number };
    byDay: { day: string; count: number }[];
    total14: number;
  } | null;
  captures: {
    djen: { id: string; label: string; oab: string; enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null; lastMessage: string | null }[];
    mni: { id: string; label: string; jtr: string; enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null; lastMessage: string | null }[];
  } | null;
  certificates: { active: number; expired: number; expiring: { id: string; label: string; notAfter: Date; daysLeft: number }[] } | null;
  petitions: { draft: number; inReview: number; approved: number; failed: number; submitted30: number } | null;
  integrations: { activeKeys: number; endpoints: number; disabledEndpoints: number; pendingDeliveries: number; failedDeliveries: number } | null;
};

/** Painel do Box: tudo calculado do banco, por escritório, e cada bloco só para quem tem a permissão do módulo. Sigilo respeitado. */
export async function getBoxDashboard(ctx: TenantContext, days = 14): Promise<BoxDashboard> {
  const org = ctx.organizationId;
  const today = todayYmd(ctx.timezone);
  const now = new Date();

  const notices = can(ctx, "inbox:read")
    ? await (async () => {
        const base = [{ organizationId: org, deletedAt: null }, visibility(ctx)];
        const sinceYmd = addDays(today, -(days - 1));
        const since = new Date(Date.now() - (days + 1) * 86_400_000);
        const [counts, stale, imported, manual, recent] = await Promise.all([
          noticeBoxCounts(ctx),
          db.courtNotice.count({ where: { AND: [...base, { status: "NEW" }, { receivedAt: { lt: new Date(Date.now() - 3 * 86_400_000) } }] } }),
          db.courtNotice.count({ where: { AND: [...base, { source: "IMPORTED", createdAt: { gte: since } }] } }),
          db.courtNotice.count({ where: { AND: [...base, { source: { not: "IMPORTED" }, createdAt: { gte: since } }] } }),
          db.courtNotice.findMany({ where: { AND: [...base, { createdAt: { gte: since } }] }, select: { createdAt: true }, take: 20_000 }),
        ]);
        const perDay = new Map<string, number>();
        for (let i = 0; i < days; i++) perDay.set(addDays(sinceYmd, i), 0);
        for (const r of recent) {
          const d = utcToZoned(r.createdAt, ctx.timezone).ymd;
          if (perDay.has(d)) perDay.set(d, (perDay.get(d) ?? 0) + 1);
        }
        const byDay = [...perDay].map(([day, count]) => ({ day, count }));
        return {
          boxes: { entrada: counts.entrada, minhas: counts.minhas, geral: counts.geral, adormecidas: counts.adormecidas, acervo: counts.acervo },
          stale,
          bySource: { imported, manual },
          byDay,
          total14: byDay.reduce((a, b) => a + b.count, 0),
        };
      })()
    : null;

  const captures = can(ctx, "integrations:manage")
    ? await (async () => {
        const [djen, mni] = await Promise.all([
          db.djenMonitor.findMany({ where: { organizationId: org }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true, label: true, oabNumber: true, oabUf: true, enabled: true, lastSyncAt: true, lastStatus: true, lastMessage: true } }),
          db.courtConnection.findMany({ where: { organizationId: org }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true, label: true, jtr: true, enabled: true, lastSyncAt: true, lastStatus: true, lastMessage: true } }),
        ]);
        return { djen: djen.map((m) => ({ id: m.id, label: m.label, oab: `${m.oabNumber}/${m.oabUf}`, enabled: m.enabled, lastSyncAt: m.lastSyncAt, lastStatus: m.lastStatus, lastMessage: m.lastMessage })), mni };
      })()
    : null;

  const certificates = can(ctx, "certificates:manage")
    ? await (async () => {
        const rows = await db.certificate.findMany({ where: { organizationId: org, revokedAt: null }, select: { id: true, label: true, notAfter: true }, orderBy: { notAfter: "asc" }, take: 200 });
        const expired = rows.filter((r) => r.notAfter < now).length;
        const expiring = rows
          .filter((r) => r.notAfter >= now && r.notAfter.getTime() - now.getTime() <= 30 * 86_400_000)
          .map((r) => ({ id: r.id, label: r.label, notAfter: r.notAfter, daysLeft: Math.ceil((r.notAfter.getTime() - now.getTime()) / 86_400_000) }));
        return { active: rows.length - expired, expired, expiring };
      })()
    : null;

  const petitions = can(ctx, "petitions:read")
    ? await (async () => {
        const where = { organizationId: org, deletedAt: null, case: { is: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } } };
        const [g, sub] = await Promise.all([
          db.petitionFiling.groupBy({ by: ["status"], where, _count: { _all: true } }),
          db.petitionFiling.count({ where: { ...where, status: "SUBMITTED", submittedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
        ]);
        const c = (s: string) => g.find((x) => x.status === s)?._count._all ?? 0;
        return { draft: c("DRAFT"), inReview: c("IN_REVIEW"), approved: c("APPROVED"), failed: c("FAILED"), submitted30: sub };
      })()
    : null;

  const integrations = can(ctx, "integrations:manage")
    ? await (async () => {
        const [activeKeys, endpoints, disabledEndpoints, pending, failed] = await Promise.all([
          db.apiKey.count({ where: { organizationId: org, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
          db.webhookEndpoint.count({ where: { organizationId: org, deletedAt: null } }),
          db.webhookEndpoint.count({ where: { organizationId: org, deletedAt: null, enabled: false } }),
          db.webhookDelivery.count({ where: { organizationId: org, status: "PENDING", endpoint: { deletedAt: null } } }),
          db.webhookDelivery.count({ where: { organizationId: org, status: "FAILED", endpoint: { deletedAt: null }, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
        ]);
        return { activeKeys, endpoints, disabledEndpoints, pendingDeliveries: pending, failedDeliveries: failed };
      })()
    : null;

  return { notices, captures, certificates, petitions, integrations };
}

