import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPETITORS, LEGALOS_PLANS, publishedPlanAverage } from "@/config/pricing";
import { PRICING_FEATURES } from "@/config/pricing-features";

describe("Evidence for public pricing comparisons", () => {
  it("ties each of the 300 catalogue operations to a distinct existing source export", () => {
    const features = PRICING_FEATURES.flatMap(g => g.features);
    expect(features).toHaveLength(300);
    expect(new Set(features.map(f => f.id)).size).toBe(300);
    expect(new Set(features.map(f => f.label)).size).toBe(300);
    expect(new Set(features.map(f => f.evidence)).size).toBe(300);
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
  });
});
