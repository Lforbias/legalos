import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPETITORS, LEGALOS_PLANS, publishedPlanAverage } from "@/config/pricing";
import { PRICING_FEATURES } from "@/config/pricing-features";

describe("Evidence for public pricing comparisons", () => {
  it("ties each active catalogue operation to a distinct existing source export", () => {
    const features = PRICING_FEATURES.flatMap(g => g.features);
    expect(features.length).toBeGreaterThan(0);
    expect(features.length).toBeLessThan(300);
    expect(new Set(features.map(f => f.id)).size).toBe(features.length);
    expect(new Set(features.map(f => f.label)).size).toBe(features.length);
    expect(new Set(features.map(f => f.evidence)).size).toBe(features.length);
    for (const feature of features) {
      const [source, symbol] = feature.evidence.split("#");
      if (!source || !symbol) throw new Error(`Missing evidence for ${feature.label}`);
      const code = fs.readFileSync(path.resolve(source), "utf8");
      expect(code, feature.label).toMatch(new RegExp(`export (?:async )?(?:function|const) ${symbol}\\b`));
    }
  });

  it("computes published plan means without assigning an undocumented ChatGuru price", () => {
    const averages = Object.fromEntries(COMPETITORS.map(c => [c.id, publishedPlanAverage(c.plans)]));
    expect(averages).toEqual({ legalmail: 893.6, advbox: 1674, astrea: 631.5, chatguru: null });
    expect(COMPETITORS.find(c => c.id === "chatguru")?.plans.every(p => p.value === null)).toBe(true);
    expect(LEGALOS_PLANS.map(p => p.name)).toEqual(["Simples", "Básico", "Intermediário", "Avançado"]);
    expect(LEGALOS_PLANS.map(p => [p.price, p.users, p.processes, p.whatsappNumbers])).toEqual([[79, 2, 150, null], [149, 5, 500, null], [349, 10, 1000, 1], [599, 20, 2000, 2]]);
  });
});
