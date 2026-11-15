import { ConflictError } from "@/lib/permissions/check";

/** TJMG private login pilot is opt-in and independent from the retired BOX. */
export const EVOLUTION_TJMG_TARGET_KEY = "tjmg-1g";
export const EVOLUTION_PJE_TARGET_KEY = EVOLUTION_TJMG_TARGET_KEY;
export const EVOLUTION_EPROC_SYSTEM = "eproc-portal";
export const EVOLUTION_PJE_JOB_ORIGIN = "EVOLUTION_TJMG_PJE_LOGIN";
export const EVOLUTION_EPROC_JOB_ORIGIN = "EVOLUTION_TJMG_EPROC_LOGIN";

export function evolutionJudicialLoginEnabled(): boolean {
  return process.env.EVOLUTION_PJE_LOGIN_ENABLED === "1";
}

export function assertEvolutionJudicialLoginEnabled(): void {
  if (!evolutionJudicialLoginEnabled()) {
    throw new ConflictError("O acesso privado aos portais judiciais do TJMG está desativado neste ambiente.");
  }
}
