import type { LoginOutcome } from "./login";

export const MAX_ATTEMPTS = 3;

export type Mapped = {
  accessStatus: "CONNECTED" | "NEEDS_ACTION" | "ERROR" | "CONNECTING";
  jobStatus: "DONE" | "FAILED" | "WAITING_PERSON" | "QUEUED";
  message: string;
  disable?: boolean;
  retry?: boolean;
};

/** Traduz o resultado do login em estado do acesso + estado do trabalho. Função pura (testável). */
export function mapOutcome(outcome: LoginOutcome, attempts: number): Mapped {
  if (outcome.ok) return { accessStatus: "CONNECTED", jobStatus: "DONE", message: "Conectado. O login no PJe funcionou." };
  const { code, message, retryable } = outcome;
  if (retryable) {
    if (attempts < MAX_ATTEMPTS) return { accessStatus: "CONNECTING", jobStatus: "QUEUED", message: `${message} Nova tentativa automática em instantes.`, retry: true };
    return { accessStatus: "ERROR", jobStatus: "FAILED", message: `${message} Depois de ${MAX_ATTEMPTS} tentativas o sistema parou. Use "Testar de novo" mais tarde.` };
  }
  if (code === "ACCOUNT_BLOCKED") return { accessStatus: "NEEDS_ACTION", jobStatus: "WAITING_PERSON", message, disable: true };
  if (code === "UNKNOWN_PAGE") return { accessStatus: "ERROR", jobStatus: "FAILED", message };
  return { accessStatus: "NEEDS_ACTION", jobStatus: "WAITING_PERSON", message };
}

/** Espera antes de repetir uma falha de rede/tempo: 2 min, 4 min, ... */
export const backoffMs = (attempts: number) => Math.min(30, 2 ** attempts) * 60_000;

