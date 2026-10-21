/**
 * 3.0-F10 — tabela de custos por ação (em créditos). Só entram aqui ações que realmente cobram.
 * Protocolo de demonstração (adaptador demo) nunca cobra: só o protocolo real.
 */
export const CREDIT_ACTIONS = {
  "petition.submit": { label: "Protocolo real de petição", cost: 5 },
} as const;
export type CreditAction = keyof typeof CREDIT_ACTIONS;
export const CREDIT_EXPIRY_WARN_DAYS = 7;
export const MAX_GRANT = 1_000_000;
