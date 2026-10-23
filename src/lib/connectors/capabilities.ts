export const MNI_OPERATIONS = ["consultarProcesso", "consultarAvisosPendentes", "entregarManifestacaoProcessual"] as const;
export type MniOperation = typeof MNI_OPERATIONS[number];
export const CONNECTION_ENVIRONMENTS = ["HOMOLOGATION", "PRODUCTION", "UNSPECIFIED"] as const;
export const ENVIRONMENT_LABEL = { HOMOLOGATION: "Homologação", PRODUCTION: "Produção", UNSPECIFIED: "Ambiente não informado (legado)" } as const;

/** Compatibilidade de contrato não significa homologação nem autorização concedida pelo tribunal. */
export function connectionSupports(c: { system: string; wsdlStatus: string | null; wsdlOperations: string[]; authProfile?: string }, operation: MniOperation): boolean {
  if (c.authProfile === "TJPR_SCMPP" && operation !== "consultarProcesso") return false;
  return c.wsdlStatus === "COMPATIBLE" ? c.wsdlOperations.includes(operation) : c.system === "pje-mni" && c.wsdlStatus === null;
}

export function connectionSoapAction(c: { wsdlActions?: unknown }, operation: MniOperation): string {
  const actions = c.wsdlActions;
  return actions && typeof actions === "object" && !Array.isArray(actions) && typeof (actions as Record<string, unknown>)[operation] === "string" ? (actions as Record<string, string>)[operation]! : "";
}
