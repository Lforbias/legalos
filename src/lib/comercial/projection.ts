/**
 * Projeção de receita recorrente (MRR) do funil. É uma ESTIMATIVA a partir de premissas editáveis, não uma promessa:
 *  - cada proposta aberta entra com valor × probabilidade, no mês em que se espera o fechamento;
 *  - o MRR ganho sofre churn mensal;
 *  - três cenários multiplicam a probabilidade (conservador / realista / otimista), limitada a 100%.
 */
export type PipelineDeal = { monthlyCents: number; probabilityPct: number; closeInMonths: number };

export type Scenario = { key: "conservador" | "realista" | "otimista"; label: string; factor: number };
export const SCENARIOS: Scenario[] = [
  { key: "conservador", label: "Conservador", factor: 0.6 },
  { key: "realista", label: "Realista", factor: 1 },
  { key: "otimista", label: "Otimista", factor: 1.3 },
];

export type ProjectionInput = {
  wonMrrCents: number;
  deals: PipelineDeal[];
  churnMonthlyPct: number;
  months?: number;
};

export type ProjectionSeries = { key: Scenario["key"]; label: string; mrrByMonth: number[]; revenueTotalCents: number; mrrEndCents: number };

export function monthsUntil(daysToClose: number): number {
  return Math.max(1, Math.ceil(Math.max(0, daysToClose) / 30));
}

export function computeProjection(input: ProjectionInput): { months: number; series: ProjectionSeries[] } {
  const months = Math.min(36, Math.max(1, Math.round(input.months ?? 12)));
  const churn = Math.min(0.5, Math.max(0, input.churnMonthlyPct / 100));
  const series = SCENARIOS.map((sc) => {
    const mrrByMonth: number[] = [];
    let mrr = Math.max(0, input.wonMrrCents);
    let revenue = 0;
    for (let m = 1; m <= months; m++) {
      mrr = mrr * (1 - churn);
      for (const d of input.deals) {
        if (d.closeInMonths !== m) continue;
        const p = Math.min(1, Math.max(0, (d.probabilityPct / 100) * sc.factor));
        mrr += Math.max(0, d.monthlyCents) * p;
      }
      mrr = Math.round(mrr);
      mrrByMonth.push(mrr);
      revenue += mrr;
    }
    return { key: sc.key, label: sc.label, mrrByMonth, revenueTotalCents: revenue, mrrEndCents: mrrByMonth[months - 1] ?? 0 };
  });
  return { months, series };
}

/** Valor ponderado do funil aberto (valor × probabilidade). */
export function weightedPipelineCents(deals: Pick<PipelineDeal, "monthlyCents" | "probabilityPct">[]): number {
  return Math.round(deals.reduce((s, d) => s + Math.max(0, d.monthlyCents) * Math.min(1, Math.max(0, d.probabilityPct / 100)), 0));
}
