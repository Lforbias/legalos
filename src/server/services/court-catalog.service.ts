"use server";
import { db } from "@/lib/db/client";
import {
  COURT_CATALOG,
  JURISDICTIONAL_COURTS,
  REFERENCE_INSTITUTIONS,
  BRANCH_LABEL,
  ENGINE_LABEL,
  INTEGRATION_STATUS_LABEL,
  type CourtBranch,
  type CourtEntry,
  type CourtDegree,
  type IntegrationStatus,
} from "@/lib/judicial/court-catalog";
import { deriveConnection, type AuthorizationState, type DerivedConnection } from "@/lib/judicial/connection-state";
import { CONNECTORS } from "@/lib/judicial/catalog";
import { MONITORING_CAPABILITIES, type Capability, type EvidenceEnvironment } from "@/lib/judicial/contracts";
import type { EvidenceRow } from "@/lib/judicial/evidence";
import { assertCan, type TenantContext } from "@/server/context";

export type CourtCatalogView = {
  code: string;
  name: string;
  branch: CourtBranch;
  branchLabel: string;
  ufs: string[];
  degrees: CourtDegree[];
  engineLabel: string | null;
  engineSource: string | null;
  integrationStatus: IntegrationStatus;
  integrationStatusLabel: string;
  portalUrl: string | null;
  verifiedAt: string | null;
  verifiedSource: string | null;
  connection: DerivedConnection | null;
  hasPortalAccess: boolean;
};

export type CourtCatalogSummary = {
  total: number;
  referenceCount: number;
  byBranch: { branch: CourtBranch; label: string; count: number }[];
  byStatus: { status: IntegrationStatus; label: string; count: number }[];
  byEngine: { engine: string; label: string; count: number }[];
};

function mapEngine(entry: CourtEntry): string | null {
  if (!entry.engine) return null;
  return ENGINE_LABEL[entry.engine] ?? entry.engine;
}

function engineForCourt(courtCode: string): string | null {
  const entry = COURT_CATALOG.find((c) => c.code === courtCode);
  if (!entry?.engine) return null;
  const familyMap: Record<string, string[]> = {
    PJE: ["pje-portal", "pje-mni"],
    EPROC: ["eproc-mni"],
    ESAJ: ["esaj-mni", "esaj"],
    PROJUDI: ["projudi-mni", "projudi"],
  };
  return familyMap[entry.engine]?.[0] ?? null;
}

export async function getCourtCatalogSummary(): Promise<CourtCatalogSummary> {
  const branchCounts = new Map<CourtBranch, number>();
  const statusCounts = new Map<IntegrationStatus, number>();
  const engineCounts = new Map<string, number>();
  for (const c of JURISDICTIONAL_COURTS) {
    branchCounts.set(c.branch, (branchCounts.get(c.branch) ?? 0) + 1);
    statusCounts.set(c.integrationStatus, (statusCounts.get(c.integrationStatus) ?? 0) + 1);
    const eng = c.engine ?? "DESCONHECIDO";
    engineCounts.set(eng, (engineCounts.get(eng) ?? 0) + 1);
  }
  return {
    total: JURISDICTIONAL_COURTS.length,
    referenceCount: REFERENCE_INSTITUTIONS.length,
    byBranch: [...branchCounts.entries()].map(([branch, count]) => ({ branch, label: BRANCH_LABEL[branch], count })),
    byStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, label: INTEGRATION_STATUS_LABEL[status], count })),
    byEngine: [...engineCounts.entries()].map(([engine, count]) => ({ engine, label: ENGINE_LABEL[engine] ?? "Desconhecido", count })),
  };
}

export async function listCourtCatalog(ctx: TenantContext, filters?: { branch?: CourtBranch; search?: string }): Promise<CourtCatalogView[]> {
  assertCan(ctx, "integrations:manage");

  let courts = [...JURISDICTIONAL_COURTS];
  if (filters?.branch) courts = courts.filter((c) => c.branch === filters.branch);
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    courts = courts.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.ufs.some((u) => u.toLowerCase() === q));
  }

  const orgId = ctx.organizationId;
  const [portalAccesses, evidenceRows] = await Promise.all([
    db.portalAccess.findMany({ where: { organizationId: orgId, system: "pje" }, orderBy: { updatedAt: "desc" }, select: { target: true, status: true, enabled: true } }),
    db.connectorEvidence.findMany({
      where: { OR: [{ organizationId: orgId }, { organizationId: null }] },
      orderBy: { checkedAt: "desc" },
      take: 500,
    }),
  ]);

  const accessByCourt = new Map<string, { status: string; enabled: boolean }>();
  for (const pa of portalAccesses) {
    const code = pa.target.replace(/-(?:1g|2g)$/i, "").toUpperCase();
    if (!accessByCourt.has(code)) accessByCourt.set(code, { status: pa.status, enabled: pa.enabled });
  }

  const evidence: EvidenceRow[] = evidenceRows.map((e) => ({
    connectorKey: e.connectorKey,
    courtCode: e.courtCode === "*" ? "*" : e.courtCode.replace(/-(?:1g|2g)$/i, "").toUpperCase(),
    operation: e.operation as Capability,
    accessMethod: e.accessMethod,
    environment: e.environment as EvidenceEnvironment,
    outcome: e.outcome as "PASSED" | "FAILED" | "INCONCLUSIVE",
    reasonCode: e.reasonCode,
    checkedAt: e.checkedAt,
    sourceId: e.sourceId,
  }));

  const now = new Date();
  return courts.map((entry) => {
    const connectorKey = engineForCourt(entry.code);
    const pa = accessByCourt.get(entry.code);
    let authState: AuthorizationState = "MISSING";
    if (pa) {
      if (pa.status === "CONNECTED") authState = "GRANTED";
      else if (pa.status === "ERROR" || pa.status === "FAILED") authState = "REJECTED";
      else if (pa.status === "EXPIRED") authState = "EXPIRED";
      else authState = "MISSING";
    }

    let connection: DerivedConnection | null = null;
    if (connectorKey) {
      const connector = CONNECTORS.find((c) => c.key === connectorKey);
      if (connector) {
        connection = deriveConnection({
          connectorKey,
          requiredOps: MONITORING_CAPABILITIES,
          courtCode: entry.code,
          authorization: connector.requiresAuthorization ? authState : "NOT_REQUIRED",
          evidence,
          now,
        });
      }
    }

    return {
      code: entry.code,
      name: entry.name,
      branch: entry.branch,
      branchLabel: BRANCH_LABEL[entry.branch],
      ufs: entry.ufs,
      degrees: entry.degrees,
      engineLabel: mapEngine(entry),
      engineSource: entry.engineSource,
      integrationStatus: entry.integrationStatus,
      integrationStatusLabel: INTEGRATION_STATUS_LABEL[entry.integrationStatus],
      portalUrl: entry.portalUrl,
      verifiedAt: entry.verifiedAt,
      verifiedSource: entry.verifiedSource,
      connection,
      hasPortalAccess: !!pa,
    };
  });
}
