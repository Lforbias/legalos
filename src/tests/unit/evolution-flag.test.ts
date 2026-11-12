import { describe, expect, it } from "vitest";
import { evolutionEnabled } from "@/lib/evolution";

describe("evolutionEnabled", () => {
  it.each([
    ["1", true],
    ["true", true],
    ["on", true],
    ["TRUE", true],
    [" 1 ", true],
    ["0", false],
    ["false", false],
    ["off", false],
    ["", false],
    [undefined, false],
  ])("LEGALOS_EVOLUTION=%j → %s", (value, expected) => {
    expect(evolutionEnabled({ LEGALOS_EVOLUTION: value })).toBe(expected);
  });

  it("defaults to process.env when no argument given", () => {
    const original = process.env.LEGALOS_EVOLUTION;
    try {
      process.env.LEGALOS_EVOLUTION = "1";
      expect(evolutionEnabled()).toBe(true);
      delete process.env.LEGALOS_EVOLUTION;
      expect(evolutionEnabled()).toBe(false);
    } finally {
      if (original !== undefined) process.env.LEGALOS_EVOLUTION = original;
      else delete process.env.LEGALOS_EVOLUTION;
    }
  });
});
