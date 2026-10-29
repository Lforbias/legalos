import type { LoginFailureCode } from "@/lib/robots/pje/login";
import type { OperationFailure } from "./contracts";

/**
 * Traduz o resultado do login do robô no vocabulário comum de falhas dos conectores.
 * Captcha, 2º fator e conta bloqueada pedem uma PESSOA (o sistema nunca tenta contornar).
 */
export function failureCodeForLogin(code: LoginFailureCode): OperationFailure["code"] {
  switch (code) {
    case "BAD_CREDENTIALS":
    case "OTP_REJECTED":
      return "AUTH_REJECTED";
    case "OTP_NOT_CONFIGURED":
    case "OTP_MISSING":
      return "AUTH_REQUIRED";
    case "ACCOUNT_BLOCKED":
    case "NEEDS_PERSON":
      return "NEEDS_PERSON";
    case "UNKNOWN_PAGE":
      return "LAYOUT_CHANGED";
    case "TIMEOUT":
      return "TIMEOUT";
    case "NETWORK":
      return "UNAVAILABLE";
  }
}
