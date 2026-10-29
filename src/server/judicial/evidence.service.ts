import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import type { Capability, EvidenceEnvironment } from "@/lib/judicial/contracts";
import type { EvidenceOutcome, EvidenceRow } from "@/lib/judicial/evidence";
import type { SourceKind } from "@/lib/judicial/health-policy";

export type EvidenceInput = {
  organizationId: string | null;
  source?: { kind: SourceKind; id: string } | null;
  connectorKey: string;
  courtCode?: string;
  operation: Capability;
  accessMethod: string;
  environment?: EvidenceEnvironment;
  outcome: EvidenceOutcome;
  reasonCode?: string | null;
  summary?: string | null;
  /** Só dados técnicos sanitizados (contagens, hashes, formatos). Nunca segredos nem conteúdo de processos. */
  details?: Record<string, unknown>;
  runId?: string | null;
  checkedById?: string | null;
};

/** Grava uma evidência. Uma verificação real é a única forma de um conector virar "validado". */
export async function recordEvidence(i: EvidenceInput, now = new Date()) {
  return db.connectorEvidence.create({
    data: {
      organizationId: i.organizationId,
      sourceKind: i.source?.kind ?? null,
      sourceId: i.source?.id ?? null,
      connectorKey: i.connectorKey,
      courtCode: (i.courtCode ?? "*").slice(0, 20),
      operation: i.operation,
      accessMethod: i.accessMethod,
      environment: i.environment ?? "PRODUCTION",
      outcome: i.outcome,
      reasonCode: i.reasonCode ?? null,
      summary: i.summary ? i.summary.slice(0, 300) : null,
      details: (i.details ?? {}) as Prisma.InputJsonValue,
      runId: i.runId ?? null,
      checkedById: i.checkedById ?? null,
      checkedAt: now,
    },
  });
}

const toRow = (e: Awaited<ReturnType<typeof db.connectorEvidence.findFirstOrThrow>>): EvidenceRow => ({
  connectorKey: e.connectorKey,
  courtCode: e.courtCode,
  operation: e.operation as Capability,
  accessMethod: e.accessMethod,
  environment: e.environment as EvidenceEnvironment,
  outcome: e.outcome as EvidenceOutcome,
  reasonCode: e.reasonCode,
  checkedAt: e.checkedAt,
  sourceId: e.sourceId,
  details: (e.details ?? {}) as Record<string, unknown>,
});

/** Evidências recentes do escritório (e globais, quando a plataforma registrou homologação própria). */
export async function loadEvidence(organizationId: string, filter: { connectorKey?: string; sourceId?: string; sinceDays?: number } = {}): Promise<EvidenceRow[]> {
  const since = new Date(Date.now() - (filter.sinceDays ?? 120) * 86_400_000);
  const rows = await db.connectorEvidence.findMany({
    // AND explícito: o recorte por escritório nunca pode ser sobrescrito por outro filtro.
    where: {
      AND: [
        { OR: [{ organizationId }, { organizationId: null }] },
        { checkedAt: { gte: since } },
        ...(filter.connectorKey ? [{ connectorKey: filter.connectorKey }] : []),
        ...(filter.sourceId ? [{ OR: [{ sourceId: filter.sourceId }, { sourceId: null }] }] : []),
      ],
    },
    orderBy: { checkedAt: "desc" },
    take: 2000,
  });
  return rows.map(toRow);
}
