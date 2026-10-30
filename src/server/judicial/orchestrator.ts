import { classifyThrown, type Capability, type EvidenceEnvironment, type EvidenceOutcome } from "@/lib/box-v3/core";
import type { SourceKind } from "@/lib/judicial/health-policy";
import { recordEvidence, type EvidenceInput } from "./evidence.service";

/**
 * Box 3.0 — orquestrador judicial (Camada C).
 *
 * Um único ponto grava evidência de funcionamento: nenhum conector deve chamar `recordEvidence` diretamente.
 * Isso garante que "existe código" (catálogo) e "funcionou de verdade, agora" (evidência/cobertura) nunca
 * fiquem fora de sincronia entre conectores diferentes — e que uma falha ao gravar a evidência NUNCA derrube a
 * operação real (ela é só registrada; a função sempre devolve ou lança o que a operação real devolveu/lançou).
 */
export type CapabilityOutcome = { outcome: EvidenceOutcome; reasonCode?: string | null; summary?: string | null; details?: Record<string, unknown> };

export type RunCapabilityOptions<T> = {
  organizationId: string | null;
  source?: { kind: SourceKind; id: string } | null;
  connectorKey: string;
  operation: Capability;
  /** Sigla do tribunal, quando souber; "*" (padrão) é a linha nacional/geral do conector. */
  courtCode?: string;
  accessMethod: string;
  environment?: EvidenceEnvironment;
  runId?: string | null;
  checkedById?: string | null;
  /** Como interpretar um resultado SEM exceção (ex.: "processo não encontrado" é INCONCLUSIVE, não FAILED). Padrão: PASSED. */
  outcomeOf?: (result: T) => CapabilityOutcome;
  /** Só para testes: substitui a gravação real no banco. */
  record?: (input: EvidenceInput) => Promise<unknown>;
};

export async function runCapability<T>(opts: RunCapabilityOptions<T>, run: () => Promise<T>): Promise<T> {
  const record = opts.record ?? recordEvidence;
  const base = {
    organizationId: opts.organizationId,
    source: opts.source ?? null,
    connectorKey: opts.connectorKey,
    courtCode: opts.courtCode ?? "*",
    operation: opts.operation,
    accessMethod: opts.accessMethod,
    environment: opts.environment ?? ("PRODUCTION" as const),
    runId: opts.runId ?? null,
    checkedById: opts.checkedById ?? null,
  };
  try {
    const result = await run();
    const o = opts.outcomeOf?.(result) ?? { outcome: "PASSED" as const };
    await record({ ...base, outcome: o.outcome, reasonCode: o.reasonCode ?? null, summary: o.summary ?? null, details: o.details ?? {} }).catch(() => {});
    return result;
  } catch (e) {
    const c = classifyThrown(e);
    await record({ ...base, outcome: "FAILED", reasonCode: c.reasonCode, summary: e instanceof Error ? e.message.slice(0, 200) : null, details: {} }).catch(() => {});
    throw e;
  }
}
