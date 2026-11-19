/**
 * Preços públicos. Até o lançamento a página de planos e os textos com valores ficam fora do site.
 * Para mostrar de novo, defina PUBLIC_PRICING=1 no ambiente do servidor.
 */
export function pricingIsPublic(env: Record<string, string | undefined> = process.env): boolean {
  return env.PUBLIC_PRICING?.trim() === "1";
}

/** Entregas do histórico público que citam valores ou o comparativo de preços. */
export const PRICING_RELEASE_IDS = ["produto-precos-definidos", "produto-precos-comparativo"] as const;
