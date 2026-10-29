import { assertBoxAvailable } from "@/server/box-guard";
import { connectionSupports } from "@/lib/connectors/capabilities";
import { db } from "@/lib/db/client";
import { readinessOf, type Capability } from "@/lib/connectors/registry";
import { COURT_SYSTEMS, getCourtSystem } from "@/lib/court-systems";
import { isKnownJtr, listTribunals } from "@/lib/mni/tribunals";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/**
 * 3.0-F6 — qual sistema atende cada tribunal neste escritório. Sem mapa, nada é presumido: o tribunal fica "não definido"
 * e o comportamento anterior (conexão PJe/MNI cadastrada) continua valendo.
 */
export async function listSystemMap(ctx: TenantContext) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  const [maps, conns] = await Promise.all([
    db.courtSystemMap.findMany({ where: { organizationId: ctx.organizationId } }),
    db.courtConnection.findMany({ where: { organizationId: ctx.organizationId, enabled: true }, select: { jtr: true, authProfile: true, system: true, wsdlStatus: true, wsdlOperations: true } }),
  ]);
  const mapBy = new Map(maps.map((m) => [m.jtr, m.system]));
  const hasMni = new Set(conns.map((c) => c.jtr));
  return listTribunals().map((t) => {
    const system = mapBy.get(t.jtr) ?? null;
    return { jtr: t.jtr, label: t.label, system, readiness: system ? readinessOf(system) : null, mniConnection: hasMni.has(t.jtr), compatibleConnection: conns.some(c => c.jtr === t.jtr && (!system || c.system === system) && connectionSupports(c, "consultarProcesso")) };
  });
}

export async function setCourtSystem(ctx: TenantContext, jtr: string, system: string | null) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  if (!isKnownJtr(jtr)) throw new ValidationError("Tribunal inválido.", { jtr: ["Selecione um tribunal da lista."] });
  if (system === null || system === "") {
    await db.courtSystemMap.deleteMany({ where: { organizationId: ctx.organizationId, jtr } });
  } else {
    if (!getCourtSystem(system)) throw new ValidationError("Sistema inválido.", { system: ["Selecione um sistema da lista."] });
    await db.courtSystemMap.upsert({ where: { organizationId_jtr: { organizationId: ctx.organizationId, jtr } }, create: { organizationId: ctx.organizationId, jtr, system, setById: ctx.userId }, update: { system, setById: ctx.userId } });
  }
  await audit({ action: "court_system.set", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_system_map", resourceId: jtr, metadata: { jtr, system: system || null }, meta: ctx.meta });
}

/** Sistema mapeado para o tribunal (ou null se não definido). */
export async function systemForJtr(organizationId: string, jtr: string): Promise<string | null> {
  assertBoxAvailable();
  return (await db.courtSystemMap.findUnique({ where: { organizationId_jtr: { organizationId, jtr } }, select: { system: true } }))?.system ?? null;
}

/** Recusa honestamente a ação quando o tribunal está mapeado para um sistema sem conector (ou sem a capacidade pedida). Sem mapa: não bloqueia. */
export async function assertConnectorFor(organizationId: string, jtr: string | null, capability: Capability): Promise<void> {
  assertBoxAvailable();
  if (!jtr) return;
  const system = await systemForJtr(organizationId, jtr);
  if (!system) return;
  const r = readinessOf(system);
  if (system !== "pje-mni") {
    const conns = await db.courtConnection.findMany({ where: { organizationId, jtr, system, enabled: true } });
    const operation = capability === "petition" ? "entregarManifestacaoProcessual" : "consultarProcesso";
    if (!conns.some(c => connectionSupports(c, operation))) throw new ConflictError(`Este tribunal está configurado como ${r.label} e não tem conector compatível configurado para esta operação. Verifique a conexão MNI 2.2.2 ou use o sistema do tribunal.`);
  }
  if (r.state === "NO_CONNECTOR" || r.state === "UNKNOWN" || !r.capabilities.includes(capability)) {
    throw new ConflictError(`Este tribunal está configurado como ${r.label}, que ainda não tem conector no LegalOS. Use o sistema do tribunal.`);
  }
}

/** Relatório de prontidão do escritório: por sistema, quantos tribunais e o que falta. */
export async function getReadinessReport(ctx: TenantContext) {
  assertBoxAvailable();
  const rows = await listSystemMap(ctx);
  const mapped = rows.filter((r) => r.system);
  const bySystem = COURT_SYSTEMS.map((s) => {
    const courts = mapped.filter((r) => r.system === s.key);
    return { system: s.key, label: s.label, courts: courts.length, readiness: readinessOf(s.key) };
  });
  const blocked = mapped.filter(r => !r.compatibleConnection).length;
  const mniWithoutMap = rows.filter((r) => r.mniConnection && !r.system).length;
  const mapConflict = rows.filter(r => r.mniConnection && r.system && !r.compatibleConnection).length;
  return { mapped: mapped.length, blocked, mniWithoutMap, mapConflict, bySystem };
}
