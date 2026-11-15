"use server";
import { runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { ensureAdapters, allSupportedTargets } from "@/lib/judicial/adapter-bootstrap";
import type { AuthMode } from "@/lib/judicial/adapter";
import { AUTH_MODE_LABEL } from "@/lib/judicial/adapter";
import { getCourtByCode, ENGINE_LABEL } from "@/lib/judicial/court-catalog";
import { evolutionJudicialLoginEnabled, EVOLUTION_EPROC_SYSTEM } from "@/lib/evolution-judicial-login";
import { assertCan } from "@/server/context";
import { listUsableCertificates } from "@/server/services/certificate.service";
import { PJE_TARGETS } from "@/lib/robots/pje/targets";
import { EPROC_PORTAL_TARGETS, getEprocPortalTarget } from "@/lib/robots/eproc/targets";
import { isRegionalPjeTarget } from "@/server/services/portal-access.service";

export type AvailableTarget = {
  targetKey: string;
  courtCode: string;
  courtName: string;
  degree: string;
  degreeLabel: string;
  adapterKey: string;
  adapterLabel: string;
  authModes: { mode: AuthMode; label: string }[];
  engineLabel: string | null;
};

export async function listAvailableTargetsAction() {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    ensureAdapters();
    const pilotEnabled = evolutionJudicialLoginEnabled();
    const all = allSupportedTargets().filter(({ adapter, target }) => adapter.descriptor.key === "pje-portal" && PJE_TARGETS.some((pje) => pje.key === target.unitCode && isRegionalPjeTarget(pje)));
    const targets: AvailableTarget[] = all.map(({ adapter, target }) => {
      const court = getCourtByCode(target.courtCode);
      return {
        targetKey: target.unitCode ?? `${target.courtCode.toLowerCase()}-${target.degree}g`,
        courtCode: target.courtCode,
        courtName: court?.name ?? target.courtCode,
        degree: target.degree,
        degreeLabel: target.degree === "1" ? "1º grau" : target.degree === "2" ? "2º grau" : target.degree,
        adapterKey: adapter.descriptor.key,
        adapterLabel: "PJe · certificado digital",
        authModes: [{ mode: "CERTIFICATE" as AuthMode, label: AUTH_MODE_LABEL.CERTIFICATE }],
        engineLabel: target.courtCode === "TJMG" ? "PJe · acervo legado" : ENGINE_LABEL.PJE ?? "PJe",
      };
    });
    for (const target of EPROC_PORTAL_TARGETS) {
      const court = getCourtByCode(target.courtCode);
      targets.push({
        targetKey: target.key,
        courtCode: target.courtCode,
        courtName: court?.name ?? target.courtCode,
        degree: target.degree,
        degreeLabel: target.label.replace(`${target.courtCode} · `, ""),
        adapterKey: EVOLUTION_EPROC_SYSTEM,
        adapterLabel: "eproc · certificado digital",
        authModes: [{ mode: "CERTIFICATE" as AuthMode, label: AUTH_MODE_LABEL.CERTIFICATE }],
        engineLabel: "eproc",
      });
    }
    return { targets, pilotEnabled };
  });
}

export async function listPortalCertificatesAction() {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    return { certificates: await listUsableCertificates(ctx, "portal") };
  });
}

export type ConnectionInfo = {
  id: string | null;
  targetKey: string;
  courtCode: string;
  degree: string;
  adapterKey: string;
  hasConnection: boolean;
  status: string | null;
  statusMessage: string | null;
  enabled: boolean;
  terminalEvents: { at: string; level: "INFO" | "SUCCESS" | "WARN" | "ERROR"; message: string }[];
  lastJobStatus: string | null;
};

function terminalEventsFrom(summary: unknown): ConnectionInfo["terminalEvents"] {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return [];
  const events = (summary as Record<string, unknown>).terminalEvents;
  if (!Array.isArray(events)) return [];
  return events.flatMap((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) return [];
    const value = event as Record<string, unknown>;
    if (typeof value.at !== "string" || typeof value.message !== "string" || !["INFO", "SUCCESS", "WARN", "ERROR"].includes(String(value.level))) return [];
    return [{ at: value.at, level: value.level as ConnectionInfo["terminalEvents"][number]["level"], message: value.message.replace(/[\r\n\u0000-\u001f]+/g, " ").slice(0, 240) }];
  }).slice(-80);
}

export async function listConnectionsAction() {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    const { db } = await import("@/lib/db/client");
    const accesses = await db.portalAccess.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        system: { in: ["pje", EVOLUTION_EPROC_SYSTEM] },
        target: { in: [...PJE_TARGETS.map((target) => target.key), ...EPROC_PORTAL_TARGETS.map((target) => target.key)] },
      },
      include: { jobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, summary: true } } },
    });
    const connections: ConnectionInfo[] = accesses.map((a) => {
      const eprocTarget = a.system === EVOLUTION_EPROC_SYSTEM ? getEprocPortalTarget(a.target) : null;
      const pjeTarget = a.system === "pje" ? PJE_TARGETS.find((target) => target.key === a.target) : null;
      return {
        id: a.id,
        targetKey: a.target,
        courtCode: eprocTarget?.courtCode ?? pjeTarget?.key.split("-")[0]?.toUpperCase() ?? "",
        degree: eprocTarget?.degree ?? (pjeTarget?.key.endsWith("-1g") ? "1" : "2"),
        adapterKey: a.system === "pje" ? "pje-portal" : a.system,
        hasConnection: true,
        status: a.status,
        statusMessage: a.statusMessage,
        enabled: a.enabled,
        terminalEvents: terminalEventsFrom(a.jobs[0]?.summary),
        lastJobStatus: a.jobs[0]?.status ?? null,
      };
    });
    return { connections };
  });
}
