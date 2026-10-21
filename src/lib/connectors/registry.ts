import { COURT_SYSTEMS, getCourtSystem } from "@/lib/court-systems";

/**
 * 3.0-F6 — registro de conectores de tribunal. Um conector declara o que sabe fazer; o que não está aqui NÃO é oferecido
 * e é recusado com mensagem clara (nada de simular consulta ou protocolo).
 * `validated` = já foi usado em tribunal real. Hoje nenhum foi: o MNI foi testado só contra tribunal simulado.
 */
export type Capability = "consult" | "import" | "petition";
export type Connector = { system: string; capabilities: Capability[]; validated: boolean };

export const CONNECTORS: Connector[] = [{ system: "pje-mni", capabilities: ["consult", "import", "petition"], validated: false }];

export const CAPABILITY_LABEL: Record<Capability, string> = { consult: "consulta de processo", import: "importação de autos", petition: "protocolo de petição" };

export const getConnector = (system: string) => CONNECTORS.find((c) => c.system === system) ?? null;

export type Readiness = { system: string; label: string; state: "READY" | "UNVALIDATED" | "NO_CONNECTOR" | "UNKNOWN"; capabilities: Capability[]; message: string };

/** Situação honesta de um sistema: pronto, pronto mas ainda sem validação em tribunal real, sem conector ou desconhecido. */
export function readinessOf(system: string): Readiness {
  const sys = getCourtSystem(system);
  if (!sys) return { system, label: system, state: "UNKNOWN", capabilities: [], message: "Sistema desconhecido." };
  const c = getConnector(system);
  if (!c) return { system, label: sys.label, state: "NO_CONNECTOR", capabilities: [], message: `${sys.label} ainda não tem conector no LegalOS: consulta e protocolo não são feitos automaticamente (use o sistema do tribunal).` };
  if (!c.validated) return { system, label: sys.label, state: "UNVALIDATED", capabilities: c.capabilities, message: `${sys.label}: conector pronto, mas ainda não validado em tribunal real. Valide em homologação antes do primeiro protocolo.` };
  return { system, label: sys.label, state: "READY", capabilities: c.capabilities, message: `${sys.label}: conector pronto.` };
}

export const allReadiness = () => COURT_SYSTEMS.map((s) => readinessOf(s.key));
