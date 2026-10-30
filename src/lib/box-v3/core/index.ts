/**
 * Box 3.0 — núcleo (Camada C, parte pura).
 *
 * Reaproveitamento deliberado: os contratos de conector, o catálogo de capacidades e as regras de evidência já
 * existem em `src/lib/judicial/*` (construídos na fase anterior do Box e preservados). Este módulo NÃO os
 * duplica — reexporta sob um nome estável "box-v3/core" para o código novo importar de um único lugar — e
 * acrescenta só o que faltava: uma classificação de erro comum para alimentar o orquestrador
 * (`src/server/judicial/orchestrator.ts`), já que cada cliente externo (DataJud, DJEN, MNI...) lança seu
 * próprio tipo de erro com um `code` próprio.
 */
export {
  CAPABILITIES,
  CAPABILITY_LABEL,
  MONITORING_CAPABILITIES,
  type Capability,
  type CapabilityStatus,
  type ConnectorFamily,
  type AccessMethod,
  type EvidenceEnvironment,
  type ConnectorDescriptor,
  type OperationFailure,
  type OperationResult,
  type NoticeQuery,
  type NoticePage,
  type NoticeSourceAdapter,
  COMMUNICATION_ORIGINS,
  type CommunicationOrigin,
  ORIGIN_KINDS,
  type OriginKind,
  ORIGIN_LABEL,
  type NoticeKindKey,
  type NormalizedCommunication,
} from "@/lib/judicial/contracts";
export { CONNECTORS, getConnector, implementedCapabilities, isImplemented, connectorKeyForMniSystem } from "@/lib/judicial/catalog";
export {
  type EvidenceOutcome,
  type EvidenceRow,
  EVIDENCE_TTL_MS,
  isFresh,
  countsAsProof,
  latestByOperation,
  type HomologationState,
  HOMOLOGATION_LABEL,
  homologationOf,
  type CoverageRow,
  coverageMatrix,
  type CoverageLevel,
  COVERAGE_LEVEL_LABEL,
  coverageLevelOf,
  isLocalOrFakeUrl,
} from "@/lib/judicial/evidence";

/** Classificação mínima de um erro lançado por um cliente externo, para a evidência gravar sempre o mesmo formato. */
export type ThrownClassification = { reasonCode: string; retryable: boolean };

/**
 * Lê `code`/`retryable` de qualquer erro de conector (DatajudError, DjenError, futuros clientes MNI/PJe), sem
 * acoplar este módulo ao tipo concreto de cada um. Erro sem `code` reconhecível vira "INTERNAL", nunca inventado.
 */
export function classifyThrown(e: unknown): ThrownClassification {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code?: unknown }).code === "string") {
    const retryable = "retryable" in e && typeof (e as { retryable?: unknown }).retryable === "boolean" ? (e as { retryable: boolean }).retryable : false;
    return { reasonCode: (e as { code: string }).code, retryable };
  }
  return { reasonCode: "INTERNAL", retryable: false };
}
