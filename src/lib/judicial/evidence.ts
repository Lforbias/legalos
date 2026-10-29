import { CAPABILITIES, type Capability, type EvidenceEnvironment } from "./contracts";
import { CONNECTORS, getConnector } from "./catalog";

/**
 * Evidência de funcionamento. É a ÚNICA base para dizer que algo está operacional ou homologado.
 *  - Evidência SIMULADA (testes, tribunal de mentira) nunca conta.
 *  - Evidência antiga vence (fica "desatualizada") e deixa de provar o funcionamento.
 */
export type EvidenceOutcome = "PASSED" | "FAILED" | "INCONCLUSIVE";

export type EvidenceRow = {
  connectorKey: string;
  courtCode: string;
  operation: Capability;
  accessMethod: string;
  environment: EvidenceEnvironment;
  outcome: EvidenceOutcome;
  reasonCode: string | null;
  checkedAt: Date;
  sourceId?: string | null;
  details?: Record<string, unknown>;
};

const H = 3_600_000;
/** Quanto tempo uma evidência continua provando o funcionamento (por operação). */
export const EVIDENCE_TTL_MS: Record<Capability, number> = {
  discover: 24 * H,
  checkAvailability: 3 * H,
  validateCredentials: 24 * H,
  listNotices: 6 * H,
  listMovements: 48 * H,
  getCase: 14 * 24 * H,
  listDocuments: 14 * 24 * H,
  downloadDocument: 30 * 24 * H,
  validateFiling: 30 * 24 * H,
  submitFiling: 90 * 24 * H,
  getOfficialReceipt: 90 * 24 * H,
  checkFilingStatus: 90 * 24 * H,
};

export const isFresh = (e: EvidenceRow, now: Date) => now.getTime() - e.checkedAt.getTime() <= EVIDENCE_TTL_MS[e.operation];

/** Evidência que pode provar algo: nunca simulada. */
export const countsAsProof = (e: EvidenceRow) => e.environment !== "SIMULATED";

/** A mais recente por operação (ignora simuladas). */
export function latestByOperation(rows: readonly EvidenceRow[]): Map<Capability, EvidenceRow> {
  const out = new Map<Capability, EvidenceRow>();
  for (const e of rows) {
    if (!countsAsProof(e)) continue;
    const cur = out.get(e.operation);
    if (!cur || e.checkedAt.getTime() > cur.checkedAt.getTime()) out.set(e.operation, e);
  }
  return out;
}

export type HomologationState = "NOT_IMPLEMENTED" | "UNVALIDATED" | "VALIDATED" | "STALE" | "FAILING";
export const HOMOLOGATION_LABEL: Record<HomologationState, string> = {
  NOT_IMPLEMENTED: "Não implementado",
  UNVALIDATED: "Implementado, ainda sem validação real",
  VALIDATED: "Validado (evidência recente)",
  STALE: "Validado, mas a evidência está desatualizada",
  FAILING: "Falhando na última verificação",
};

export function homologationOf(connectorKey: string, operation: Capability, evidence: readonly EvidenceRow[], now: Date): HomologationState {
  const c = getConnector(connectorKey);
  if (!c || !c.capabilities[operation].implemented) return "NOT_IMPLEMENTED";
  const latest = latestByOperation(evidence.filter((e) => e.connectorKey === connectorKey)).get(operation);
  if (!latest || latest.outcome === "INCONCLUSIVE") return "UNVALIDATED";
  if (latest.outcome === "FAILED") return "FAILING";
  return isFresh(latest, now) ? "VALIDATED" : "STALE";
}

export type CoverageRow = {
  connectorKey: string;
  connectorLabel: string;
  courtCode: string;
  operation: Capability;
  accessMethod: string;
  state: HomologationState;
  lastEvidenceAt: Date | null;
  lastEnvironment: EvidenceEnvironment | null;
};

/**
 * Matriz de cobertura: conector × tribunal × operação. Mostra tudo que é implementado e o que há de evidência.
 * "*" é a linha nacional/geral do conector (uma evidência sem tribunal específico).
 * Nunca declara cobertura nacional: a matriz só tem o que foi de fato visto.
 */
export function coverageMatrix(evidence: readonly EvidenceRow[], now: Date): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const c of CONNECTORS) {
    const courts = new Set<string>(["*"]);
    for (const e of evidence) if (e.connectorKey === c.key && countsAsProof(e)) courts.add(e.courtCode);
    for (const court of [...courts].sort()) {
      for (const op of CAPABILITIES) {
        if (!c.capabilities[op].implemented) continue;
        const relevant = evidence.filter((e) => e.connectorKey === c.key && e.courtCode === court && e.operation === op && countsAsProof(e));
        const latest = relevant.reduce<EvidenceRow | null>((a, b) => (!a || b.checkedAt > a.checkedAt ? b : a), null);
        rows.push({
          connectorKey: c.key,
          connectorLabel: c.label,
          courtCode: court,
          operation: op,
          accessMethod: c.accessMethod,
          state: homologationOf(c.key, op, relevant, now),
          lastEvidenceAt: latest?.checkedAt ?? null,
          lastEnvironment: latest?.environment ?? null,
        });
      }
    }
  }
  return rows;
}

/** Níveis de verificação (§10): uma resposta HTTP 200 não significa captura comprovada. */
export type CoverageLevel = "SERVICE_REACHABLE" | "AUTH_VALID" | "QUERY_COMPLETED" | "PARTIAL_SYNC" | "CAPTURE_PROVEN" | "NOT_VERIFIABLE";
export const COVERAGE_LEVEL_LABEL: Record<CoverageLevel, string> = {
  SERVICE_REACHABLE: "Serviço acessível",
  AUTH_VALID: "Acesso autenticado",
  QUERY_COMPLETED: "Consulta concluída",
  PARTIAL_SYNC: "Sincronização parcial",
  CAPTURE_PROVEN: "Captura comprovada",
  NOT_VERIFIABLE: "Cobertura não verificável",
};

export function coverageLevelOf(i: { reachable: boolean; authValid?: boolean; queryCompleted: boolean; partial: boolean; itemsEverCaptured: number; verifiable?: boolean }): CoverageLevel {
  if (i.verifiable === false) return "NOT_VERIFIABLE";
  if (i.partial) return "PARTIAL_SYNC";
  if (i.queryCompleted) return i.itemsEverCaptured > 0 ? "CAPTURE_PROVEN" : "QUERY_COMPLETED";
  if (i.authValid) return "AUTH_VALID";
  if (i.reachable) return "SERVICE_REACHABLE";
  return "NOT_VERIFIABLE";
}

/** Endereço local ou fictício (localhost, 127.x, .test, .invalid...): uma resposta vinda dele NUNCA prova uma fonte real. Endereço ilegível também conta como fictício. */
export function isLocalOrFakeUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "::1" || h === "[::1]" || /^127\./.test(h) || h.endsWith(".localhost") || h.endsWith(".test") || h.endsWith(".invalid") || h.endsWith(".example");
  } catch {
    return true;
  }
}
