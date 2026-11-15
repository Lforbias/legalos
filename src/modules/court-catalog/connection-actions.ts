"use server";
import { runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { ensureAdapters, allSupportedTargets } from "@/lib/judicial/adapter-bootstrap";
import type { AuthMode } from "@/lib/judicial/adapter";
import { AUTH_MODE_LABEL } from "@/lib/judicial/adapter";
import { getCourtByCode, ENGINE_LABEL } from "@/lib/judicial/court-catalog";
import { evolutionJudicialLoginEnabled, EVOLUTION_EPROC_SYSTEM, EVOLUTION_PJE_TARGET_KEY } from "@/lib/evolution-judicial-login";
import { assertCan } from "@/server/context";
import { listUsableCertificates } from "@/server/services/certificate.service";

export type AvailableTarget = {
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
    const all = allSupportedTargets().filter(({ adapter, target }) => adapter.descriptor.key === "pje-portal" && target.courtCode === "TJMG" && target.degree === "1");
    const targets: AvailableTarget[] = all.map(({ adapter, target }) => {
      const court = getCourtByCode(target.courtCode);
      return {
        courtCode: target.courtCode,
        courtName: court?.name ?? target.courtCode,
        degree: target.degree,
        degreeLabel: target.degree === "1" ? "1º grau" : target.degree === "2" ? "2º grau" : target.degree,
        adapterKey: adapter.descriptor.key,
        adapterLabel: "PJe · certificado digital",
        authModes: [{ mode: "CERTIFICATE" as AuthMode, label: AUTH_MODE_LABEL.CERTIFICATE }],
        engineLabel: target.courtCode === "TJMG" ? "PJe · acervo legado (não homologado)" : court?.engine ? ENGINE_LABEL[court.engine] ?? null : null,
      };
    });
    targets.push({
      courtCode: "TJMG",
      courtName: getCourtByCode("TJMG")?.name ?? "Tribunal de Justiça de Minas Gerais",
      degree: "1",
      degreeLabel: "1º grau",
      adapterKey: EVOLUTION_EPROC_SYSTEM,
      adapterLabel: "eproc · certificado digital",
      authModes: [{ mode: "CERTIFICATE" as AuthMode, label: AUTH_MODE_LABEL.CERTIFICATE }],
      engineLabel: "eproc TJMG (implantação gradual) · não homologado",
    });
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
  courtCode: string;
  degree: string;
  adapterKey: string;
  hasConnection: boolean;
  status: string | null;
  enabled: boolean;
};

export async function listConnectionsAction() {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    assertCan(ctx, "integrations:manage");
    const { db } = await import("@/lib/db/client");
    const accesses = await db.portalAccess.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, system: { in: ["pje", EVOLUTION_EPROC_SYSTEM] }, target: EVOLUTION_PJE_TARGET_KEY },
      select: { id: true, target: true, status: true, enabled: true, system: true },
    });
    const connections: ConnectionInfo[] = accesses.map((a) => {
      const parts = a.target.split("-");
      return {
        id: a.id,
        courtCode: (parts[0] ?? "").toUpperCase(),
        degree: parts[1] === "1g" ? "1" : "2",
        adapterKey: a.system === "pje" ? "pje-portal" : a.system,
        hasConnection: true,
        status: a.status,
        enabled: a.enabled,
      };
    });
    return { connections };
  });
}
