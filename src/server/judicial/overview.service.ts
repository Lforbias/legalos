import { db } from "@/lib/db/client";
import type { AlertSeverity } from "@/lib/judicial/alerts";
import type { SourceKind } from "@/lib/judicial/health-policy";
import { can, type TenantContext } from "@/server/context";
import { noticeBoxCounts, visibility } from "@/server/services/notice.service";
import { computeOrgHealth } from "./health.service";

/** Em que ponto está a configuração do Box deste escritório (só quem administra integrações vê). */
export type SetupStep = "PROFESSIONAL" | "MONITORING" | "FIRST_CHECK" | "DONE";

export type SetupState = {
  step: SetupStep;
  professionals: number;
  monitors: number;
  /** Monitoramentos que já tiveram uma consulta real concluída (não simulada). */
  verifiedMonitors: number;
  privateSources: number;
  certificates: number;
};

export type LatestCommunication = {
  id: string;
  title: string;
  kind: string;
  originKind: string | null;
  sourceSystem: string | null;
  courtCode: string | null;
  caseNumber: string | null;
  capturedAt: Date;
  viewed: boolean;
  officialAck: boolean;
  assigned: boolean;
};

/** Linha de saúde em linguagem do advogado: sem mensagens técnicas de erro. */
export type PlainSource = { kind: SourceKind; id: string; label: string; detail: string; severity: AlertSeverity | "OK"; headline: string; enabled: boolean; lastSuccessAt: Date | null };

export type BoxOverview = {
  setup: SetupState | null;
  inbox: { notViewed: number; unassigned: number; mine: number; stale: number; capturedLast24h: number; total: number };
  latest: LatestCommunication[];
  health: { severity: AlertSeverity | "OK"; sources: PlainSource[]; jobsLate: number; admin: boolean };
};

export function setupStepOf(s: Pick<SetupState, "professionals" | "monitors" | "verifiedMonitors">): SetupStep {
  if (s.monitors === 0) return s.professionals === 0 ? "PROFESSIONAL" : "MONITORING";
  if (s.verifiedMonitors === 0) return "FIRST_CHECK";
  return "DONE";
}

export async function getSetupState(organizationId: string): Promise<SetupState> {
  const [professionals, monitors, verified, connections, portals, certificates] = await Promise.all([
    db.professionalIdentity.count({ where: { organizationId, active: true } }),
    db.djenMonitor.count({ where: { organizationId } }),
    db.djenMonitor.count({ where: { organizationId, firstVerifiedAt: { not: null } } }),
    db.courtConnection.count({ where: { organizationId } }),
    db.portalAccess.count({ where: { organizationId } }),
    db.certificate.count({ where: { organizationId, revokedAt: null } }),
  ]);
  const base = { professionals, monitors, verifiedMonitors: verified };
  return { ...base, step: setupStepOf(base), privateSources: connections + portals, certificates };
}

/** Visão Geral do Box 2.0: só dados reais do banco, com o sigilo dos processos respeitado. */
export async function getBoxOverview(ctx: TenantContext, now = new Date()): Promise<BoxOverview> {
  const org = ctx.organizationId;
  const admin = can(ctx, "integrations:manage");
  const base = [{ organizationId: org, deletedAt: null }, visibility(ctx)];
  const day = new Date(now.getTime() - 86_400_000);

  const [boxes, notViewed, stale, last24, total, latestRows, health, setup] = await Promise.all([
    noticeBoxCounts(ctx),
    db.courtNotice.count({ where: { AND: [...base, { status: "NEW" }, { firstViewedAt: null }] } }),
    db.courtNotice.count({ where: { AND: [...base, { status: "NEW" }, { receivedAt: { lt: new Date(now.getTime() - 3 * 86_400_000) } }] } }),
    db.courtNotice.count({ where: { AND: [...base, { OR: [{ capturedAt: { gte: day } }, { capturedAt: null, createdAt: { gte: day } }] }] } }),
    db.courtNotice.count({ where: { AND: base } }),
    db.courtNotice.findMany({
      where: { AND: base },
      orderBy: [{ capturedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 8,
      select: { id: true, title: true, kind: true, originKind: true, sourceSystem: true, courtCode: true, caseNumber: true, capturedAt: true, createdAt: true, firstViewedAt: true, officialAckAt: true, assigneeId: true, teamId: true },
    }),
    computeOrgHealth(org, { now }),
    admin ? getSetupState(org) : Promise.resolve(null),
  ]);

  return {
    setup,
    inbox: { notViewed, unassigned: boxes.entrada, mine: boxes.minhas, stale, capturedLast24h: last24, total },
    latest: latestRows.map((n) => ({
      id: n.id, title: n.title, kind: n.kind, originKind: n.originKind, sourceSystem: n.sourceSystem, courtCode: n.courtCode, caseNumber: n.caseNumber,
      capturedAt: n.capturedAt ?? n.createdAt, viewed: n.firstViewedAt !== null, officialAck: n.officialAckAt !== null, assigned: n.assigneeId !== null || n.teamId !== null,
    })),
    health: {
      severity: health.severity,
      admin,
      jobsLate: health.jobs.filter((j) => j.level !== "OK").length,
      sources: health.sources.map((s) => ({ kind: s.kind, id: s.id, label: s.label, detail: s.detail, severity: s.severity, headline: s.headline, enabled: s.enabled, lastSuccessAt: s.lastSuccessAt })),
    },
  };
}
