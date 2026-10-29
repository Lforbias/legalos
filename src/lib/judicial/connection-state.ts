import type { Capability } from "./contracts";
import { CAPABILITY_LABEL } from "./contracts";
import { getConnector } from "./catalog";
import { countsAsProof, isFresh, latestByOperation, type EvidenceRow } from "./evidence";

/**
 * Estado de uma conexão, derivado de EVIDÊNCIA. "Conectado" nunca significa "um registro foi criado no banco".
 */
export type ConnectionState = "OPERATIONAL" | "PARTIAL" | "NEEDS_AUTHORIZATION" | "AUTH_EXPIRED" | "TEMPORARY_FAILURE" | "NOT_HOMOLOGATED" | "UNAVAILABLE";

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  OPERATIONAL: "Operacional",
  PARTIAL: "Parcialmente operacional",
  NEEDS_AUTHORIZATION: "Necessita autorização",
  AUTH_EXPIRED: "Autenticação expirada",
  TEMPORARY_FAILURE: "Falha temporária",
  NOT_HOMOLOGATED: "Não homologado",
  UNAVAILABLE: "Indisponível",
};

export type AuthorizationState = "NOT_REQUIRED" | "GRANTED" | "MISSING" | "EXPIRED" | "REJECTED";

export type DerivedConnection = {
  state: ConnectionState;
  /** Código estável para testes e métricas. */
  reason: string;
  /** Frase para o advogado (sem SOAP, WSDL, endpoint, token...). */
  headline: string;
  nextAction: string | null;
  passed: Capability[];
  failed: Capability[];
  missing: Capability[];
  notImplemented: Capability[];
  lastEvidenceAt: Date | null;
};

const TEMPORARY = new Set(["UNAVAILABLE", "TIMEOUT", "RATE_LIMITED", "INTERNAL"]);
const AUTH_FAILURES = new Set(["AUTH_REQUIRED", "AUTH_REJECTED", "NEEDS_PERSON"]);

export type DeriveInput = {
  connectorKey: string;
  /** Operações que esta conexão precisa cumprir (ex.: monitoramento = checkAvailability + listNotices). */
  requiredOps: readonly Capability[];
  courtCode: string;
  authorization: AuthorizationState;
  evidence: readonly EvidenceRow[];
  now: Date;
};

export function deriveConnection(i: DeriveInput): DerivedConnection {
  const c = getConnector(i.connectorKey);
  const base = { passed: [] as Capability[], failed: [] as Capability[], missing: [] as Capability[], notImplemented: [] as Capability[], lastEvidenceAt: null as Date | null };
  if (!c) return { ...base, state: "UNAVAILABLE", reason: "UNKNOWN_CONNECTOR", headline: "Este tipo de conexão não é reconhecido pelo LegalOS.", nextAction: null };

  const notImplemented = i.requiredOps.filter((op) => !c.capabilities[op].implemented);
  const implemented = i.requiredOps.filter((op) => c.capabilities[op].implemented);
  if (!implemented.length) {
    const why = c.capabilities[i.requiredOps[0] ?? "listNotices"]?.note;
    return { ...base, notImplemented, state: "UNAVAILABLE", reason: "NOT_IMPLEMENTED", headline: why ?? "O LegalOS ainda não faz esta operação neste sistema.", nextAction: "Use o portal do tribunal enquanto a integração não existe." };
  }

  const relevant = i.evidence.filter((e) => e.connectorKey === i.connectorKey && (e.courtCode === i.courtCode || e.courtCode === "*") && countsAsProof(e));
  const latest = latestByOperation(relevant);
  const passed: Capability[] = [];
  const failed: Capability[] = [];
  const missing: Capability[] = [];
  let temporary = false;
  let authFailure: string | null = null;
  let hardFailure: string | null = null;
  let geoBlocked = false;
  for (const op of implemented) {
    const e = latest.get(op);
    if (!e || e.outcome === "INCONCLUSIVE") missing.push(op);
    else if (e.outcome === "PASSED" && isFresh(e, i.now)) passed.push(op);
    else if (e.outcome === "PASSED") missing.push(op); // desatualizada: não prova mais
    else {
      failed.push(op);
      const code = e.reasonCode ?? "INTERNAL";
      if (code === "GEO_BLOCKED") geoBlocked = true;
      else if (TEMPORARY.has(code)) temporary = true;
      else if (AUTH_FAILURES.has(code) || code === "AUTH_EXPIRED") authFailure = code;
      else hardFailure = code;
    }
  }
  const lastEvidenceAt = [...latest.values()].reduce<Date | null>((a, e) => (!a || e.checkedAt > a ? e.checkedAt : a), null);
  const out = (state: ConnectionState, reason: string, headline: string, nextAction: string | null): DerivedConnection => ({ state, reason, headline, nextAction, passed, failed, missing, notImplemented, lastEvidenceAt });

  // Autorização vem antes de tudo: sem ela, qualquer outra evidência é irrelevante.
  if (c.requiresAuthorization) {
    if (i.authorization === "MISSING") return out("NEEDS_AUTHORIZATION", "AUTH_MISSING", "Este tribunal exige a sua autorização (login ou certificado) para consultar comunicações privadas.", "Autorizar o acesso a este tribunal.");
    if (i.authorization === "REJECTED") return out("NEEDS_AUTHORIZATION", "AUTH_REJECTED", "Não conseguimos autenticar o seu acesso a este tribunal. Confira o login, a senha ou o certificado.", "Atualizar o acesso (login/senha ou certificado).");
    if (i.authorization === "EXPIRED" || authFailure === "AUTH_EXPIRED") return out("AUTH_EXPIRED", "AUTH_EXPIRED", "A autenticação deste acesso expirou.", "Renovar o acesso (novo login ou certificado válido).");
    if (authFailure === "NEEDS_PERSON") return out("NEEDS_AUTHORIZATION", "NEEDS_PERSON", "O tribunal pediu uma verificação que só uma pessoa pode fazer (captcha ou código do segundo fator).", "Concluir a verificação e tentar de novo.");
    if (authFailure) return out("NEEDS_AUTHORIZATION", authFailure, "Não conseguimos autenticar o seu acesso a este tribunal. Verifique se o acesso está autorizado para consulta.", "Atualizar o acesso.");
  }

  if (geoBlocked) return out("UNAVAILABLE", "GEO_BLOCKED", "A fonte recusa o servidor onde o LegalOS está hospedado (acesso permitido só a partir do Brasil).", "Equipe LegalOS: executar a captura a partir de um servidor brasileiro.");
  if (hardFailure && !passed.length) return out("UNAVAILABLE", hardFailure, hardFailure === "LAYOUT_CHANGED" || hardFailure === "INVALID_RESPONSE" ? "A fonte mudou de formato e a captura foi pausada para não registrar dados errados." : "A fonte não respondeu como esperado.", "A equipe do LegalOS foi avisada para revisar o conector.");

  const allPassed = passed.length === implemented.length && notImplemented.length === 0;
  if (allPassed) return out("OPERATIONAL", "ALL_REQUIRED_PASSED", "Funcionando: a consulta foi concluída com sucesso recentemente.", null);
  if (passed.length) {
    const lacking = [...failed, ...missing, ...notImplemented].map((op) => CAPABILITY_LABEL[op].toLowerCase());
    return out("PARTIAL", notImplemented.length && !failed.length && !missing.length ? "PARTIAL_BY_DESIGN" : "PARTIAL_EVIDENCE", `Parte do que é necessário já funciona. Falta: ${lacking.join(", ")}.`, failed.length ? "Verificar a conexão." : null);
  }
  if (temporary) return out("TEMPORARY_FAILURE", "TEMPORARY", "A fonte não respondeu agora. Vamos tentar de novo automaticamente.", null);
  return out("NOT_HOMOLOGATED", "NO_EVIDENCE", "Configurado, mas ainda sem uma verificação real que comprove o funcionamento.", "Executar a verificação.");
}
