/**
 * Contrato genérico de adaptador de tribunal.
 *
 * Cada motor (PJe, eproc, e-SAJ, PROJUDI…) implementa este contrato.
 * O runner do robô é agnóstico ao motor: pega o job, resolve o adaptador
 * pelo `system` do PortalAccess e delega.
 *
 * Regras que valem para QUALQUER adaptador:
 *  - Nunca contornar captcha, 2FA ou bloqueio: devolver NEEDS_PERSON.
 *  - Nunca repetir senha errada (bloqueia a conta): devolver BAD_CREDENTIALS.
 *  - Nunca adivinhar tela desconhecida: devolver UNKNOWN_PAGE com diagnóstico.
 *  - Segredos ficam no cofre (sealBytes/openBytes). Nenhum segredo pode
 *    aparecer em log, resposta, summary de job ou tela.
 *  - A sessão é isolada por escritório. O adaptador recebe uma Page limpa
 *    (sem cookies de outro escritório).
 */

import type { ConnectorFamily, Capability, EvidenceEnvironment } from "./contracts";
import type { CourtDegree } from "./court-catalog";

// ────────── Resultado do adaptador ──────────

export type AdapterFailureCode =
  | "BAD_CREDENTIALS"
  | "ACCOUNT_BLOCKED"
  | "OTP_REQUIRED"
  | "OTP_REJECTED"
  | "CERTIFICATE_REQUIRED"
  | "CERTIFICATE_EXPIRED"
  | "CERTIFICATE_REJECTED"
  | "NEEDS_PERSON"
  | "CAPTCHA"
  | "UNKNOWN_PAGE"
  | "LAYOUT_CHANGED"
  | "TIMEOUT"
  | "NETWORK"
  | "GEO_BLOCKED"
  | "RATE_LIMITED"
  | "INTERNAL";

export type AdapterOutcome<T = void> =
  | { ok: true; data: T; message: string }
  | { ok: false; code: AdapterFailureCode; message: string; retryable: boolean; detail?: string };

// ────────── Destino ──────────

export type CourtTarget = {
  courtCode: string;
  degree: CourtDegree;
  label: string;
  unitCode?: string;
  unitLabel?: string;
};

// ────────── Modos de autenticação ──────────

export type AuthMode = "PASSWORD" | "CERTIFICATE" | "PASSWORD_OTP" | "MNI_TOKEN";

export const AUTH_MODE_LABEL: Record<AuthMode, string> = {
  PASSWORD: "Senha",
  CERTIFICATE: "Certificado digital",
  PASSWORD_OTP: "Senha + 2º fator",
  MNI_TOKEN: "Token MNI",
};

// ────────── Contrato do adaptador ──────────

export type AdapterCapabilities = {
  validateCredentials: boolean;
  listNotices?: boolean;
  getCase?: boolean;
  listDocuments?: boolean;
  downloadDocument?: boolean;
  submitFiling?: boolean;
};

export type AdapterDescriptor = {
  key: string;
  engineFamily: ConnectorFamily;
  label: string;
  supportedAuthModes: AuthMode[];
  capabilities: AdapterCapabilities;
  supportedTargets: readonly CourtTarget[];
};

export interface TribunalAdapter {
  readonly descriptor: AdapterDescriptor;

  validateCredentials(ctx: AdapterContext): Promise<AdapterOutcome<{ evidenceEnvironment: EvidenceEnvironment }>>;

  // Fases futuras (5B, 5C) — declaradas mas não exigidas.
  // listNotices?(ctx: AdapterContext, query: unknown): Promise<AdapterOutcome<unknown>>;
  // getCase?(ctx: AdapterContext, caseNumber: string): Promise<AdapterOutcome<unknown>>;
}

export type AdapterContext = {
  organizationId: string;
  userId: string;
  target: CourtTarget;
  authMode: AuthMode;
  /** Função que abre os bytes cifrados do cofre. O adaptador NUNCA recebe o segredo em texto. */
  openSecret: () => Promise<AdapterSecret>;
  /** Página de navegador isolada (Playwright). null quando o adaptador não precisa de browser. */
  page: unknown | null;
  /** Nomes para redação de PII nas assinaturas de tela. */
  piiNames?: string[];
  signal?: AbortSignal;
};

export type AdapterSecret = {
  document?: string;
  password?: string;
  otpSecret?: string | null;
  certificateBytes?: Buffer;
  certificatePassword?: string;
  mniToken?: string;
};

// ────────── Tradução de resultado para estado da conexão ──────────

export type MappedOutcome = {
  accessStatus: "CONNECTED" | "NEEDS_ACTION" | "ERROR" | "CONNECTING";
  jobStatus: "DONE" | "FAILED" | "WAITING_PERSON" | "QUEUED";
  message: string;
  disable?: boolean;
  retry?: boolean;
};

const MAX_ATTEMPTS = 3;

export function mapAdapterOutcome(outcome: AdapterOutcome<unknown>, attempts: number): MappedOutcome {
  if (outcome.ok) {
    return { accessStatus: "CONNECTED", jobStatus: "DONE", message: outcome.message || "Conectado com sucesso." };
  }

  const { code, message, retryable } = outcome;

  if (retryable) {
    if (attempts < MAX_ATTEMPTS) {
      return { accessStatus: "CONNECTING", jobStatus: "QUEUED", message: `${message} Nova tentativa automática em instantes.`, retry: true };
    }
    return { accessStatus: "ERROR", jobStatus: "FAILED", message: `${message} Depois de ${MAX_ATTEMPTS} tentativas o sistema parou. Use "Testar de novo" mais tarde.` };
  }

  if (code === "ACCOUNT_BLOCKED") return { accessStatus: "NEEDS_ACTION", jobStatus: "WAITING_PERSON", message, disable: true };
  if (code === "UNKNOWN_PAGE" || code === "LAYOUT_CHANGED") return { accessStatus: "ERROR", jobStatus: "FAILED", message };
  if (code === "NEEDS_PERSON" || code === "CAPTCHA") return { accessStatus: "NEEDS_ACTION", jobStatus: "WAITING_PERSON", message };
  if (code === "OTP_REQUIRED" || code === "CERTIFICATE_REQUIRED") return { accessStatus: "NEEDS_ACTION", jobStatus: "WAITING_PERSON", message };

  return { accessStatus: "NEEDS_ACTION", jobStatus: "WAITING_PERSON", message };
}

export const backoffMs = (attempts: number) => Math.min(30, 2 ** attempts) * 60_000;
