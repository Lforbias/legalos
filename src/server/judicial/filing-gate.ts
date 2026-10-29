import { ConflictError } from "@/lib/permissions/check";
import { countsAsProof, isFresh } from "@/lib/judicial/evidence";
import type { FilingTarget } from "@/lib/petitioning/adapter";
import { loadEvidence } from "./evidence.service";

/**
 * Trava de homologação do protocolo real. Protocolar em PRODUÇÃO por um conector exige evidência RECENTE, NÃO simulada e aprovada
 * da operação "protocolar" para o MESMO conector e tribunal: um protocolo de teste no ambiente de homologação do tribunal,
 * ou um protocolo oficial já confirmado (FILED_CONFIRMED). Simulação e homologação passam: é assim que a evidência é gerada,
 * e elas nunca produzem protocolo oficial (veja `statusAfterDelivery`).
 */
export async function assertFilingAllowed(organizationId: string, target: FilingTarget, now = new Date()): Promise<void> {
  if (target.environment !== "PRODUCTION") return;
  const rows = await loadEvidence(organizationId, { connectorKey: target.connectorKey, sinceDays: 120 });
  const proven = rows.some((e) => e.operation === "submitFiling" && e.courtCode === target.courtCode && e.outcome === "PASSED" && countsAsProof(e) && isFresh(e, now));
  if (!proven) {
    throw new ConflictError(
      "Protocolo real bloqueado: este conector ainda não foi homologado neste tribunal. Faça antes um protocolo de teste no ambiente de homologação do tribunal ou protocole no portal do tribunal e registre o recibo aqui.",
    );
  }
}
