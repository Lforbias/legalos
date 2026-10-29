import { PROTOS_2 } from "@/modules/prototypes/phases-2";
import { PROTOS_3 } from "@/modules/prototypes/phases-3";
import { PROTOS_4 } from "@/modules/prototypes/phases-4";
import { describe, expect, it } from "vitest";
import { PHASES_2, PHASES_3, PHASES_4 } from "@/lib/updates";
import { PROTOTYPES, getPrototype, prototypesEnabled } from "@/modules/prototypes/registry";

describe("protótipos de tela", () => {
  it("há um protótipo para cada fase ainda por fazer das versões 2.0, 3.0 e 4.0", () => {
    const retired = new Set([...PROTOS_2, ...PROTOS_3, ...PROTOS_4].filter(p => p.space === "Box").map(p => p.id));
    expect(PROTOTYPES.some(p => p.space === "Box")).toBe(false);
    const pending = [...PHASES_2, ...PHASES_3, ...PHASES_4].filter((p) => p.status !== "feita" && !retired.has(p.id)).map((p) => p.id);
    const have = new Set(PROTOTYPES.map((p) => p.id));
    expect(pending.filter((id) => !have.has(id))).toEqual([]);
  });
  it("ids únicos, com conteúdo e sem restos de dados reais", () => {
    const ids = PROTOTYPES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROTOTYPES) {
      expect(p.blocks.length, p.id).toBeGreaterThan(0);
      expect(p.title.length, p.id).toBeGreaterThan(5);
      expect(getPrototype(p.id)).toBe(p);
    }
    const all = JSON.stringify(PROTOTYPES);
    expect(all).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}(?!\*)/); // nenhum CPF completo
  });
  it("tabelas têm o mesmo número de colunas em todas as linhas", () => {
    for (const p of PROTOTYPES) for (const b of p.blocks) if (b.t === "table") for (const r of b.rows) expect(r.length, `${p.id}: ${b.title}`).toBe(b.cols.length);
  });
  it("fica desligado por padrão e só liga com LEGALOS_PROTOTYPES=1", () => {
    const old = process.env.LEGALOS_PROTOTYPES;
    delete process.env.LEGALOS_PROTOTYPES;
    expect(prototypesEnabled()).toBe(false);
    process.env.LEGALOS_PROTOTYPES = "1";
    expect(prototypesEnabled()).toBe(true);
    if (old === undefined) delete process.env.LEGALOS_PROTOTYPES; else process.env.LEGALOS_PROTOTYPES = old;
  });
});
