"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { ensureAdapters, findAdapterForCourt, allSupportedTargets } from "@/lib/judicial/adapter-bootstrap";
import type { CourtTarget, AuthMode } from "@/lib/judicial/adapter";
import { AUTH_MODE_LABEL } from "@/lib/judicial/adapter";
import { getCourtByCode, ENGINE_LABEL } from "@/lib/judicial/court-catalog";

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
    ensureAdapters();
    const all = allSupportedTargets();
    const targets: AvailableTarget[] = all.map(({ adapter, target }) => {
      const court = getCourtByCode(target.courtCode);
      return {
        courtCode: target.courtCode,
        courtName: court?.name ?? target.courtCode,
        degree: target.degree,
        degreeLabel: target.degree === "1" ? "1º grau" : target.degree === "2" ? "2º grau" : target.degree,
        adapterKey: adapter.descriptor.key,
        adapterLabel: adapter.descriptor.label,
        authModes: adapter.descriptor.supportedAuthModes.map((m) => ({ mode: m, label: AUTH_MODE_LABEL[m] })),
        engineLabel: court?.engine ? ENGINE_LABEL[court.engine] ?? null : null,
      };
    });
    return { targets };
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
    const { db } = await import("@/lib/db/client");
    const accesses = await db.portalAccess.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      select: { id: true, target: true, status: true, enabled: true, system: true },
    });
    const connections: ConnectionInfo[] = accesses.map((a) => {
      const parts = a.target.split("-");
      return {
        id: a.id,
        courtCode: (parts[0] ?? "").toUpperCase(),
        degree: parts[1] === "1g" ? "1" : "2",
        adapterKey: a.system,
        hasConnection: true,
        status: a.status,
        enabled: a.enabled,
      };
    });
    return { connections };
  });
}
