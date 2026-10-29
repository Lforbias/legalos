import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navItemInBoxVersion } from "@/config/navigation";
import { boxV2Enabled, boxV2EnabledAnywhere } from "@/lib/features";

describe("Box retirado: flags antigas não reativam o módulo", () => {
  it("nem chave geral nem piloto reativam a implementação antiga", () => {
    for (const env of [{}, { LEGALOS_BOX_V2: "1" }, { LEGALOS_BOX_V2: "true" }, { LEGALOS_BOX_V2: "on" }, { LEGALOS_BOX_V2_ORGS: "org-a" }]) {
      expect(boxV2Enabled("org-a", env)).toBe(false);
      expect(boxV2EnabledAnywhere(env)).toBe(false);
    }
  });
  it("remove navegação das duas versões e mantém Func e Chat", () => {
    for (const flag of [true, false]) {
      const visible = NAV_ITEMS.filter(n => navItemInBoxVersion(n, flag));
      expect(visible.some(n => n.space === "box")).toBe(false);
      expect(visible.some(n => n.key === "overview")).toBe(true);
      expect(visible.some(n => n.key === "whatsapp")).toBe(true);
      expect(visible.some(n => n.key === "integrations" && n.space === "func")).toBe(true);
    }
  });
});
