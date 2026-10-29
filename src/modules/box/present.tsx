import { Badge } from "@/components/ui/badge";
import type { AlertSeverity } from "@/lib/judicial/alerts";
import type { ConnectionState } from "@/lib/judicial/connection-state";
import type { HomologationState } from "@/lib/judicial/evidence";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

/** Cor do estado de uma conexão. Verde só para "Operacional" (comprovado); o resto chama atenção ou fica neutro. */
export const STATE_TONE: Record<ConnectionState | "OFF", Tone> = {
  OPERATIONAL: "success",
  PARTIAL: "warning",
  NEEDS_AUTHORIZATION: "warning",
  AUTH_EXPIRED: "danger",
  TEMPORARY_FAILURE: "warning",
  NOT_HOMOLOGATED: "neutral",
  UNAVAILABLE: "danger",
  OFF: "neutral",
};

export const SEVERITY_TONE: Record<AlertSeverity | "OK", Tone> = { OK: "success", INFO: "info", WARNING: "warning", CRITICAL: "danger" };
export const SEVERITY_LABEL: Record<AlertSeverity | "OK", string> = { OK: "Em dia", INFO: "Informativo", WARNING: "Atenção", CRITICAL: "Crítico" };

export const HOMOLOGATION_TONE: Record<HomologationState, Tone> = { NOT_IMPLEMENTED: "neutral", UNVALIDATED: "neutral", VALIDATED: "success", STALE: "warning", FAILING: "danger" };

export function StateBadge({ state, label }: { state: ConnectionState | "OFF"; label: string }) {
  return <Badge tone={STATE_TONE[state]}>{label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: AlertSeverity | "OK" }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

export { originLabel as originName } from "@/lib/judicial/notice-state";
