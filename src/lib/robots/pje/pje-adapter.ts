/**
 * Adaptador PJe — encapsula o login existente no contrato genérico de TribunalAdapter.
 *
 * Usa o mesmo loginPje(), os mesmos targets e a mesma lógica de OTP.
 * A diferença: agora o runner pode resolver este adaptador por chave ("pje-portal")
 * sem conhecer os detalhes do SSO do PDPJ/Keycloak.
 */

import type { Page } from "playwright-core";
import type {
  TribunalAdapter,
  AdapterDescriptor,
  AdapterContext,
  AdapterOutcome,
  CourtTarget,
} from "@/lib/judicial/adapter";
import type { EvidenceEnvironment } from "@/lib/judicial/contracts";
import { PJE_TARGETS, type PjeTarget } from "./targets";
import { loginPje, type PjeCredentials } from "./login";

function pjeTargetToCourtTarget(t: PjeTarget): CourtTarget {
  const parts = t.key.split("-");
  const courtCode = parts[0]!.toUpperCase();
  const degree = parts[1] === "1g" ? "1" as const : "2" as const;
  return {
    courtCode,
    degree,
    label: t.label,
    unitCode: t.key,
  };
}

const supportedTargets: readonly CourtTarget[] = PJE_TARGETS.map(pjeTargetToCourtTarget);

const descriptor: AdapterDescriptor = {
  key: "pje-portal",
  engineFamily: "PJE",
  label: "PJe — login pelo SSO do PDPJ",
  supportedAuthModes: ["PASSWORD", "PASSWORD_OTP"],
  capabilities: {
    validateCredentials: true,
  },
  supportedTargets,
};

function findPjeTarget(target: CourtTarget): PjeTarget | null {
  if (target.unitCode) {
    return PJE_TARGETS.find((t) => t.key === target.unitCode) ?? null;
  }
  const code = target.courtCode.toLowerCase();
  const degree = target.degree === "1" ? "1g" : "2g";
  return PJE_TARGETS.find((t) => t.key === `${code}-${degree}`) ?? null;
}

async function validateCredentials(
  ctx: AdapterContext,
): Promise<AdapterOutcome<{ evidenceEnvironment: EvidenceEnvironment }>> {
  const pjeTarget = findPjeTarget(ctx.target);
  if (!pjeTarget) {
    return {
      ok: false,
      code: "INTERNAL",
      message: `O tribunal ${ctx.target.courtCode} (${ctx.target.degree}º grau) ainda não tem destino configurado no adaptador PJe.`,
      retryable: false,
    };
  }

  const secret = await ctx.openSecret();
  if (!secret.document || !secret.password) {
    return {
      ok: false,
      code: "BAD_CREDENTIALS",
      message: "CPF/CNPJ ou senha não encontrados no cofre.",
      retryable: false,
    };
  }

  const creds: PjeCredentials = {
    document: secret.document,
    password: secret.password,
    otpSecret: secret.otpSecret,
  };

  const page = ctx.page as Page;
  const result = await loginPje(page, pjeTarget, creds, {
    names: ctx.piiNames,
  });

  if (result.ok) {
    return {
      ok: true,
      data: { evidenceEnvironment: "PRODUCTION" as EvidenceEnvironment },
      message: "Conectado. O login no PJe funcionou.",
    };
  }

  const codeMap: Record<string, AdapterOutcome<never>["code"]> = {
    BAD_CREDENTIALS: "BAD_CREDENTIALS",
    ACCOUNT_BLOCKED: "ACCOUNT_BLOCKED",
    OTP_NOT_CONFIGURED: "OTP_REQUIRED",
    OTP_MISSING: "OTP_REQUIRED",
    OTP_REJECTED: "OTP_REJECTED",
    NEEDS_PERSON: "NEEDS_PERSON",
    UNKNOWN_PAGE: "UNKNOWN_PAGE",
    TIMEOUT: "TIMEOUT",
    NETWORK: "NETWORK",
  };

  return {
    ok: false,
    code: codeMap[result.code] ?? "INTERNAL",
    message: result.message,
    retryable: result.retryable,
    detail: result.detail,
  };
}

export const pjeAdapter: TribunalAdapter = {
  descriptor,
  validateCredentials,
};
