import { db } from "@/lib/db/client";
import { assertCan, can, type TenantContext } from "@/server/context";
import { todayYmd } from "@/lib/dates/ymd";
import { caseVisibility } from "./case.service";

export type DashboardData = {
  members: { active: number; suspended: number };
  pendingInvitations: number;
  /** Indicadores jurídicos reais; `null` quando o perfil não tem permissão de leitura do módulo. */
  legal: { activeClients: number | null; activeCases: number | null; suspendedCases: number | null };
  /** Prazos e tarefas reais; `null` sem permissão de leitura do módulo. */
  work: {
    deadlines: { open: number; overdue: number; draft: number; next7: number } | null;
    myTasks: { open: number; overdue: number } | null;
    notices: { new: number; mine: number } | null;
  };
  roleDistribution: { name: string; count: number }[];
  activityByDay: { day: string; count: number }[];
  recentActivity: { id: string; action: string; result: string; createdAt: Date; actorName: string | null }[] | null;
  plan: {
    name: string;
    status: string;
    trialEndsAt: Date | null;
    trialDaysLeft: number | null;
    maxUsers: number | null;
    usedUsers: number;
  } | null;
};

/**
 * Indicadores calculados a partir do banco, restritos ao escritório do contexto.
 * Existem dados de equipe, convites, auditoria, clientes e processos; os demais indicadores
 * (prazos, financeiro, etc.) serão adicionados à medida que os módulos forem implementados (não há números fictícios).
 */
export async function getDashboard(ctx: TenantContext, days = 14): Promise<DashboardData> {
  const org = ctx.organizationId;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const canAudit = can(ctx, "audit:read");

  const canClients = can(ctx, "clients:read");
  const canCases = can(ctx, "cases:read");
  const caseWhere = { AND: [{ organizationId: org, deletedAt: null }, caseVisibility(ctx)] };

  const today = new Date(`${todayYmd(ctx.timezone)}T00:00:00Z`);
  const in7 = new Date(today.getTime() + 7 * 86_400_000);
  const dlBase = { organizationId: org, status: { in: ["DRAFT", "VALIDATED"] as ("DRAFT" | "VALIDATED")[] }, case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } };
  const taskBase = { organizationId: org, deletedAt: null, assigneeId: ctx.userId, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] as ("TODO" | "IN_PROGRESS" | "WAITING")[] }, OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] };
  const canDl = can(ctx, "deadlines:read");
  const canTk = can(ctx, "tasks:read");
  const canNotices = can(ctx, "inbox:read");
  const noticeVis = { organizationId: org, deletedAt: null, OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] };
  const [ntNew, ntMine] = await Promise.all([
    canNotices ? db.courtNotice.count({ where: { ...noticeVis, status: "NEW" } }) : null,
    canNotices ? db.courtNotice.count({ where: { ...noticeVis, status: "DISTRIBUTED", assigneeId: ctx.userId } }) : null,
  ]);
  const [dlOpen, dlOverdue, dlDraft, dlNext7, tkOpen, tkOverdue] = await Promise.all([
    canDl ? db.deadline.count({ where: dlBase }) : null,
    canDl ? db.deadline.count({ where: { ...dlBase, dueDate: { lt: today } } }) : null,
    canDl ? db.deadline.count({ where: { ...dlBase, status: "DRAFT" } }) : null,
    canDl ? db.deadline.count({ where: { ...dlBase, dueDate: { gte: today, lte: in7 } } }) : null,
    canTk ? db.task.count({ where: taskBase }) : null,
    canTk ? db.task.count({ where: { ...taskBase, dueDate: { lt: today } } }) : null,
  ]);
  const [statusGroups, pendingInvitations, roleGroups, sub, activity, recent, activeClients, activeCases, suspendedCases] = await Promise.all([
    db.membership.groupBy({ by: ["status"], where: { organizationId: org }, _count: { _all: true } }),
    db.invitation.count({ where: { organizationId: org, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.role.findMany({
      where: { organizationId: org },
      select: { name: true, _count: { select: { memberships: true } } },
    }),
    db.subscription.findUnique({ where: { organizationId: org }, include: { plan: true } }),
    canAudit
      ? db.$queryRaw<{ day: Date; count: bigint }[]>`
          SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day, count(*) AS count
          FROM audit_logs
          WHERE organization_id = ${org}::uuid AND created_at >= ${since}
          GROUP BY 1 ORDER BY 1`
      : Promise.resolve([]),
    canAudit
      ? db.auditLog.findMany({
          where: { organizationId: org },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, action: true, result: true, createdAt: true, user: { select: { name: true } } },
        })
      : Promise.resolve(null),
    canClients ? db.client.count({ where: { organizationId: org, deletedAt: null, status: "ACTIVE" } }) : Promise.resolve(null),
    canCases ? db.case.count({ where: { AND: [caseWhere, { status: "ACTIVE", archivedAt: null }] } }) : Promise.resolve(null),
    canCases ? db.case.count({ where: { AND: [caseWhere, { status: "SUSPENDED", archivedAt: null }] } }) : Promise.resolve(null),
  ]);

  const count = (s: "ACTIVE" | "SUSPENDED") => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const byDay = new Map(activity.map((a) => [new Date(a.day).toISOString().slice(0, 10), Number(a.count)]));
  const activityByDay = Array.from({ length: days }, (_, i) => {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    return { day: key, count: byDay.get(key) ?? 0 };
  });

  return {
    members: { active: count("ACTIVE"), suspended: count("SUSPENDED") },
    pendingInvitations,
    legal: { activeClients, activeCases, suspendedCases },
    work: {
      deadlines: dlOpen === null ? null : { open: dlOpen, overdue: dlOverdue ?? 0, draft: dlDraft ?? 0, next7: dlNext7 ?? 0 },
      notices: ntNew === null ? null : { new: ntNew, mine: ntMine ?? 0 },
      myTasks: tkOpen === null ? null : { open: tkOpen, overdue: tkOverdue ?? 0 },
    },
    roleDistribution: roleGroups.map((r) => ({ name: r.name, count: r._count.memberships })).filter((r) => r.count > 0),
    activityByDay: canAudit ? activityByDay : [],
    recentActivity: recent
      ? recent.map((r) => ({ id: r.id, action: r.action, result: r.result, createdAt: r.createdAt, actorName: r.user?.name ?? null }))
      : null,
    plan: sub
      ? {
          name: sub.plan.name,
          status: sub.status,
          trialEndsAt: sub.trialEndsAt,
          trialDaysLeft: sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null,
          maxUsers: sub.plan.maxUsers,
          usedUsers: count("ACTIVE") + count("SUSPENDED"),
        }
      : null,
  };
}

export async function listAuditLogs(ctx: TenantContext, opts: { page: number; pageSize: number; action?: string }) {
  assertCan(ctx, "audit:read");
  const where = {
    organizationId: ctx.organizationId,
    ...(opts.action ? { action: { startsWith: opts.action } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        action: true,
        result: true,
        resourceType: true,
        resourceId: true,
        ipAddress: true,
        correlationId: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);
  return { total, rows };
}
