import { ConflictError } from "@/lib/permissions/check";

/** TJMG private login pilot is opt-in and independent from the retired BOX. */
export const EVOLUTION_TJMG_TARGET_KEY = "tjmg-1g";
export const EVOLUTION_PJE_TARGET_KEY = EVOLUTION_TJMG_TARGET_KEY;
export const EVOLUTION_EPROC_SYSTEM = "eproc-portal";
export const EVOLUTION_PJE_JOB_ORIGIN = "EVOLUTION_TJMG_PJE_LOGIN";
export const EVOLUTION_EPROC_JOB_ORIGIN = "EVOLUTION_TJMG_EPROC_LOGIN";

/**
 * O piloto precisa ser ligado de propósito (EVOLUTION_PJE_LOGIN_ENABLED=1) — o deploy não liga mais sozinho.
 * Quando informado o escritório, ele também precisa estar em EVOLUTION_PJE_LOGIN_ORGS (IDs separados por vírgula):
 * certificado, senha e semente do 2FA do advogado só são aceitos de escritórios autorizados.
 */
export function evolutionJudicialLoginEnabled(organizationId?: string): boolean {
  if (process.env.EVOLUTION_PJE_LOGIN_ENABLED !== "1") return false;
  if (organizationId === undefined) return true;
  const allowed = (process.env.EVOLUTION_PJE_LOGIN_ORGS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return allowed.includes(organizationId);
}

export function assertEvolutionJudicialLoginEnabled(): void {
  if (!evolutionJudicialLoginEnabled()) {
    throw new ConflictError("O acesso privado aos portais judiciais do TJMG está desativado neste ambiente.");
  }
}
