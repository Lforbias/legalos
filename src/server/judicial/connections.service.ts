import { db } from "@/lib/db/client";
import { CAPABILITIES, CAPABILITY_LABEL, MONITORING_CAPABILITIES, type Capability, type EvidenceEnvironment } from "@/lib/judicial/contracts";
import { CONNECTORS, connectorKeyForMniSystem, getConnector } from "@/lib/judicial/catalog";
import { deriveConnection, CONNECTION_STATE_LABEL, type AuthorizationState, type ConnectionState } from "@/lib/judicial/connection-state";
import { coverageMatrix, COVERAGE_LEVEL_LABEL, HOMOLOGATION_LABEL, homologationOf, latestByOperation, type CoverageLevel, type EvidenceRow, type HomologationState } from "@/lib/judicial/evidence";
import type { SourceKind } from "@/lib/judicial/health-policy";
import { getCourtSystem } from "@/lib/court-systems";
import { can, type TenantContext } from "@/server/context";
import { loadEvidence } from "./evidence.service";

export type CapabilityView = { op: Capability; label: string; implemented: boolean; state: HomologationState; stateLabel: string; lastEvidenceAt: Date | null; note: string | null };

export type ConnectionTechnical = {
  reason: string;
  connectorKey: string;
  connectorVersion: string;
  accessMethod: string;
  lastMessage: string | null;
  failed: Capability[];
  missing: Capability[];
  notImplemented: Capability[];
  evidence: { operation: Capability; outcome: string; environment: EvidenceEnvironment; reasonCode: string | null; checkedAt: Date; summary: string | null }[];
  runs: { id: string; status: string; startedAt: Date; finishedAt: Date | null; fetched: number; created: number; pages: number; coverage: string | null; errorCode: string | null; errorMessage: string | null }[];
};

/** Fontes que têm cartão na Central de Conexões (o DataJud é consulta de processo, não uma fonte de comunicações). */
export type BoxSourceKind = Exclude<SourceKind, "DATAJUD">;

export type ConnectionCard = {
  id: string;
  kind: BoxSourceKind;
  connectorKey: string;
  title: string;
  subtitle: string;
  courtCode: string;
  enabled: boolean;
  /** Estado derivado de evidência; "OFF" quando a conexão está desligada (nada é consultado). */
  state: ConnectionState | "OFF";
  stateLabel: string;
  headline: string;
  nextAction: string | null;
  coverage: CoverageLevel | null;
  coverageLabel: string | null;
  lastSuccessAt: Date | null;
  lastCaptureAt: Date | null;
  lastEvidenceAt: Date | null;
  capabilities: CapabilityView[];
  limitations: string[];
  professional: string | null;
  /** Só para quem administra integrações. Nunca para o advogado comum. */
  technical: ConnectionTechnical | null;
};

/** Termos que o advogado não precisa ver. As observações e limitações com esses termos ficam só na área técnica. */
const JARGON = /\b(MNI|WSDL|SOAP|endpoint|webservice|SSO|PJeOffice|XML|token|payload|consultar[A-Z]\w*|entregar[A-Z]\w*|IP do servidor)\b/i;
/** Rótulo sem a sigla técnica entre parênteses (ex.: "PJe (MNI)" → "PJe"). */
export const plainLabel = (label: string): string => label.replace(/\s*\((?:MNI|SOAP|WSDL)[^)]*\)/gi, "").trim();
export const plainLimitations = (items: readonly string[]): string[] => items.filter((l) => !JARGON.test(l));

function capabilityViews(connectorKey: string, evidence: readonly EvidenceRow[], now: Date, technical: boolean): CapabilityView[] {
  const c = getConnector(connectorKey);
  if (!c) return [];
  const latest = latestByOperation(evidence.filter((e) => e.connectorKey === connectorKey));
  return CAPABILITIES.filter((op) => c.capabilities[op].implemented).map((op) => {
    const state = homologationOf(connectorKey, op, evidence, now);
    return { op, label: CAPABILITY_LABEL[op], implemented: true, state, stateLabel: HOMOLOGATION_LABEL[state], lastEvidenceAt: latest.get(op)?.checkedAt ?? null, note: technical ? (c.capabilities[op].note ?? null) : null };
  });
}

const toEvidenceView = (e: { operation: string; outcome: string; environment: string; reasonCode: string | null; checkedAt: Date; summary: string | null }) => ({ operation: e.operation as Capability, outcome: e.outcome, environment: e.environment as EvidenceEnvironment, reasonCode: e.reasonCode, checkedAt: e.checkedAt, summary: e.summary });

/**
 * Central de Conexões: UMA linha por fonte realmente configurada (OAB no DJEN, conexão com tribunal, acesso de portal).
 * O estado vem de EVIDÊNCIA (consultas reais registradas), nunca de existir um cadastro. Detalhes técnicos só para administradores.
 */
export async function listConnectionCards(ctx: TenantContext, now = new Date()): Promise<ConnectionCard[]> {
  const org = ctx.organizationId;
  const technical = can(ctx, "integrations:manage");
  const [monitors, connections, accesses, evidence, professionals] = await Promise.all([
    db.djenMonitor.findMany({ where: { organizationId: org }, orderBy: { createdAt: "asc" } }),
    db.courtConnection.findMany({ where: { organizationId: org }, orderBy: { createdAt: "asc" }, include: { certificate: { select: { notAfter: true, revokedAt: true } } } }),
    db.portalAccess.findMany({ where: { organizationId: org }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, target: true, system: true, enabled: true, status: true, statusMessage: true, lastLoginAt: true, userId: true } }),
    loadEvidence(org),
    db.professionalIdentity.findMany({ where: { organizationId: org }, select: { id: true, name: true } }),
  ]);
  const profName = new Map(professionals.map((p) => [p.id, p.name]));
  const cards: ConnectionCard[] = [];

  const recentFor = (kind: SourceKind, id: string) => (technical ? db.connectorEvidence.findMany({ where: { organizationId: org, sourceKind: kind, sourceId: id }, orderBy: { checkedAt: "desc" }, take: 8 }) : Promise.resolve([]));

  for (const m of monitors) {
    const ev = evidence.filter((e) => e.sourceId === m.id || e.sourceId === null || e.sourceId === undefined);
    const d = deriveConnection({ connectorKey: "djen", requiredOps: MONITORING_CAPABILITIES, courtCode: "*", authorization: "NOT_REQUIRED", evidence: ev, now });
    const lastRun = await db.syncRun.findFirst({ where: { organizationId: org, sourceKind: "DJEN", sourceId: m.id, status: { in: ["SUCCEEDED", "PARTIAL"] } }, orderBy: { startedAt: "desc" }, select: { coverage: true } });
    const runs = technical ? await db.syncRun.findMany({ where: { organizationId: org, sourceKind: "DJEN", sourceId: m.id }, orderBy: { startedAt: "desc" }, take: 8 }) : [];
    const recent = await recentFor("DJEN", m.id);
    const c = getConnector("djen")!;
    const caps = capabilityViews("djen", ev, now, technical);
    // O que a última execução leu só é "comprovado" se a consulta tiver evidência REAL (resposta simulada ou de servidor fictício não conta).
    const provenCoverage = caps.find((x) => x.op === "listNotices")?.state === "VALIDATED" ? ((lastRun?.coverage as CoverageLevel | null) ?? null) : null;
    const state = m.enabled ? d.state : "OFF";
    cards.push({
      id: m.id, kind: "DJEN", connectorKey: "djen", title: `Publicações do DJEN — ${m.label}`, subtitle: `OAB ${m.oabUf}/${m.oabNumber}`, courtCode: "*", enabled: m.enabled,
      state, stateLabel: state === "OFF" ? "Desligado" : CONNECTION_STATE_LABEL[state], headline: m.enabled ? d.headline : "Desligado: nenhuma consulta está sendo feita.", nextAction: m.enabled ? d.nextAction : "Ligar o monitoramento.",
      coverage: provenCoverage, coverageLabel: provenCoverage ? COVERAGE_LEVEL_LABEL[provenCoverage] : null,
      lastSuccessAt: m.lastSuccessAt, lastCaptureAt: m.lastCaptureAt, lastEvidenceAt: d.lastEvidenceAt,
      capabilities: caps, limitations: technical ? c.limitations : plainLimitations(c.limitations), professional: m.professionalId ? (profName.get(m.professionalId) ?? null) : null,
      technical: technical ? { reason: d.reason, connectorKey: "djen", connectorVersion: c.version, accessMethod: c.accessMethod, lastMessage: m.lastMessage, failed: d.failed, missing: d.missing, notImplemented: d.notImplemented, evidence: recent.map(toEvidenceView), runs: runs.map((r) => ({ id: r.id, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt, fetched: r.fetched, created: r.createdCount, pages: r.pages, coverage: r.coverage, errorCode: r.errorCode, errorMessage: r.errorMessage })) } : null,
    });
  }

  for (const conn of connections) {
    const key = connectorKeyForMniSystem(conn.system);
    const ev = evidence.filter((e) => e.sourceId === conn.id || e.sourceId === null || e.sourceId === undefined);
    const cert = conn.certificate;
    const certOk = cert ? !cert.revokedAt && cert.notAfter > now : false;
    const needsCert = conn.authMode === "CERTIFICATE" || conn.authMode === "PASSWORD_AND_CERTIFICATE";
    const needsPassword = conn.authMode === "PASSWORD" || conn.authMode === "PASSWORD_AND_CERTIFICATE";
    const authorization: AuthorizationState = needsCert && !certOk ? (cert && !cert.revokedAt ? "EXPIRED" : "MISSING") : needsPassword && !conn.secretEnc ? "MISSING" : "GRANTED";
    const d = deriveConnection({ connectorKey: key, requiredOps: ["listNotices"], courtCode: conn.jtr, authorization, evidence: ev, now });
    const recent = await recentFor("MNI", conn.id);
    const c = getConnector(key)!;
    const state = conn.enabled ? d.state : "OFF";
    cards.push({
      id: conn.id, kind: "MNI", connectorKey: key, title: conn.label, subtitle: `${technical ? (getCourtSystem(conn.system)?.label ?? conn.system) : plainLabel(getCourtSystem(conn.system)?.label ?? conn.system)} · tribunal ${conn.jtr}`, courtCode: conn.jtr, enabled: conn.enabled,
      state, stateLabel: state === "OFF" ? "Desligado" : CONNECTION_STATE_LABEL[state], headline: conn.enabled ? d.headline : "Desligado: nenhuma consulta está sendo feita.", nextAction: conn.enabled ? d.nextAction : "Ligar a conexão.",
      coverage: null, coverageLabel: null, lastSuccessAt: conn.lastStatus === "OK" ? conn.lastSyncAt : null, lastCaptureAt: null, lastEvidenceAt: d.lastEvidenceAt,
      capabilities: capabilityViews(key, ev.filter((e) => e.courtCode === conn.jtr || e.courtCode === "*"), now, technical), limitations: technical ? c.limitations : plainLimitations(c.limitations), professional: null,
      technical: technical ? { reason: d.reason, connectorKey: key, connectorVersion: c.version, accessMethod: c.accessMethod, lastMessage: conn.lastMessage, failed: d.failed, missing: d.missing, notImplemented: d.notImplemented, evidence: recent.map(toEvidenceView), runs: [] } : null,
    });
  }

  for (const a of accesses) {
    const ev = evidence.filter((e) => e.sourceId === a.id || e.sourceId === null || e.sourceId === undefined);
    const authorization: AuthorizationState = a.status === "NEEDS_ACTION" ? "REJECTED" : a.status === "PENDING" ? "MISSING" : "GRANTED";
    const d = deriveConnection({ connectorKey: "pje-portal", requiredOps: ["validateCredentials", "listNotices"], courtCode: a.target, authorization, evidence: ev, now });
    const recent = await recentFor("PORTAL", a.id);
    const c = getConnector("pje-portal")!;
    const state = a.enabled ? d.state : "OFF";
    cards.push({
      id: a.id, kind: "PORTAL", connectorKey: "pje-portal", title: a.label, subtitle: `Login no portal · ${a.target}`, courtCode: a.target, enabled: a.enabled,
      state, stateLabel: state === "OFF" ? "Desligado" : CONNECTION_STATE_LABEL[state], headline: a.enabled ? d.headline : "Desligado: o robô não usa este acesso.", nextAction: a.enabled ? d.nextAction : "Ligar o acesso.",
      coverage: null, coverageLabel: null, lastSuccessAt: a.lastLoginAt, lastCaptureAt: null, lastEvidenceAt: d.lastEvidenceAt,
      capabilities: capabilityViews("pje-portal", ev, now, technical), limitations: technical ? c.limitations : plainLimitations(c.limitations), professional: null,
      technical: technical ? { reason: d.reason, connectorKey: "pje-portal", connectorVersion: c.version, accessMethod: c.accessMethod, lastMessage: a.statusMessage, failed: d.failed, missing: d.missing, notImplemented: d.notImplemented, evidence: recent.map(toEvidenceView), runs: [] } : null,
    });
  }
  return cards;
}

export type CatalogEntry = { key: string; label: string; accessMethod: string; requiresAuthorization: boolean; implemented: { op: Capability; label: string; state: HomologationState; stateLabel: string }[]; notImplemented: Capability[]; limitations: string[] };

/** "O que o LegalOS faz hoje": por conector, o que existe em código e o que já tem validação real. Sem cobertura nacional inventada. */
export async function getCapabilityCatalog(ctx: TenantContext, now = new Date()): Promise<{ entries: CatalogEntry[]; matrix: ReturnType<typeof coverageMatrix> | null }> {
  const evidence = await loadEvidence(ctx.organizationId);
  const entries = CONNECTORS.map((c) => ({
    key: c.key, label: can(ctx, "integrations:manage") ? c.label : plainLabel(c.label), accessMethod: c.accessMethod, requiresAuthorization: c.requiresAuthorization,
    implemented: CAPABILITIES.filter((op) => c.capabilities[op].implemented).map((op) => { const state = homologationOf(c.key, op, evidence, now); return { op, label: CAPABILITY_LABEL[op], state, stateLabel: HOMOLOGATION_LABEL[state] }; }),
    notImplemented: CAPABILITIES.filter((op) => !c.capabilities[op].implemented),
    limitations: can(ctx, "integrations:manage") ? c.limitations : plainLimitations(c.limitations),
  }));
  return { entries, matrix: can(ctx, "integrations:manage") ? coverageMatrix(evidence, now) : null };
}
