import { LEGALOS_PLANS } from "@/config/pricing";

/** Planos oficiais do LegalOS (preços aprovados em `src/config/pricing.ts`). O Comercial nunca inventa preço: lê daqui. */
export type CatalogPlan = { key: string; name: string; priceCents: number; maxUsers: number; processes: number; description: string };

export const PLAN_CATALOG: CatalogPlan[] = LEGALOS_PLANS.map((p) => ({ key: p.id, name: p.name, priceCents: Math.round(p.price * 100), maxUsers: p.users, processes: p.processes, description: p.subtitle }));

export const findPlan = (key: string) => PLAN_CATALOG.find((p) => p.key === key) ?? null;
