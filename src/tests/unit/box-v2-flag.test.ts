import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/config/navigation";
import { boxV2Enabled, boxV2EnabledAnywhere } from "@/lib/features";

describe("Box retirado: flags antigas não reativam o módulo", () => {
  it("nem chave geral nem piloto reativam a implementação antiga", () => {
    for (const env of [{}, { LEGALOS_BOX_V2: "1" }, { LEGALOS_BOX_V2: "true" }, { LEGALOS_BOX_V2: "on" }, { LEGALOS_BOX_V2_ORGS: "org-a" }]) {
      expect(boxV2Enabled("org-a", env)).toBe(false);
      expect(boxV2EnabledAnywhere(env)).toBe(false);
    }
  });
  it("retira as rotas do Box do menu e mantém os módulos do escritório", () => {
    const keys = new Set(NAV_ITEMS.map(n => n.key));
    expect(keys.has("box-overview")).toBe(false);
    expect(keys.has("inbox")).toBe(false);
    expect(keys.has("petitions")).toBe(false);
    expect(keys.has("certificates")).toBe(false);
    expect(keys.has("overview")).toBe(true);
    expect(keys.has("whatsapp")).toBe(true);
    expect(keys.has("integrations")).toBe(true);
  });
});
