import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { COWORK_AREA, OFFICE_AREAS, areaInfo, areaItemLabels } from "@/config/office-map";

describe("mapa do escritório (site público e Lobby)", () => {
  it("mostra todos os departamentos do menu Evolution, menos o próprio Lobby", () => {
    const expected = Object.keys(DEPARTMENTS).filter((d) => d !== "lobby").sort();
    expect([...OFFICE_AREAS].sort()).toEqual(expected);
  });

  it("cada área tem nome, cor, resumo e itens reais do menu", () => {
    for (const d of OFFICE_AREAS) {
      const info = areaInfo(d);
      expect(info.name).toBeTruthy();
      expect(info.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(info.summary.length).toBeGreaterThan(10);
      const labels = areaItemLabels(d);
      expect(labels.length).toBeGreaterThan(0);
      expect(new Set(labels).size).toBe(labels.length);
    }
    expect(COWORK_AREA.href).toBe("/cowork");
  });

  it("não cita módulos que saíram do produto", () => {
    const text = JSON.stringify([OFFICE_AREAS.map((d) => [areaInfo(d).name, areaInfo(d).summary, areaItemLabels(d, 99)]), COWORK_AREA]);
    expect(text).not.toMatch(/\bBox\b|\bFunc\b|Ethos/);
  });
});
