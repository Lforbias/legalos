import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/config/navigation";
import {
  DEPARTMENTS,
  EVOLUTION_NAV,
  departmentItems,
  type Department,
} from "@/config/evolution-navigation";

describe("evolution navigation config", () => {
  const allDepts: Department[] = ["lobby", "mesa", "juridico", "atendimento", "comercial", "financeiro", "administracao"];

  it("defines all seven departments with name, color, icon and summary", () => {
    for (const dept of allDepts) {
      const d = DEPARTMENTS[dept];
      expect(d.name).toBeTruthy();
      expect(d.color).toBeTruthy();
      expect(d.color).not.toContain("hsl(var");
      expect(d.icon).toBeDefined();
      expect(d.summary).toBeTruthy();
    }
  });

  it("department colors are valid hex or CSS values, not hsl(var())", () => {
    for (const dept of allDepts) {
      const color = DEPARTMENTS[dept].color;
      expect(color).not.toMatch(/hsl\(var/);
    }
  });

  it("every nav item has a unique key", () => {
    const keys = EVOLUTION_NAV.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every nav item references a valid department", () => {
    for (const item of EVOLUTION_NAV) {
      expect(allDepts).toContain(item.department);
    }
  });

  it("departmentItems returns only sub-items (excludes department landing)", () => {
    for (const dept of allDepts.filter((d) => d !== "lobby")) {
      const items = departmentItems(dept);
      expect(items.every((n) => n.key !== `evo-${dept}`)).toBe(true);
      expect(items.every((n) => n.department === dept)).toBe(true);
    }
  });

  it("portal:access is not used as a permission (it's for external clients only)", () => {
    for (const item of EVOLUTION_NAV) {
      expect(item.permission).not.toBe("portal:access");
    }
  });
});

it("links the office modules from Evolution navigation", () => {
  const separateLinks = ["overview", "portal", "prototypes", "help"];
  const routes = new Set(EVOLUTION_NAV.map((item) => item.href));
  for (const item of NAV_ITEMS) {
    if (!separateLinks.includes(item.key)) {
      expect(routes, item.key).toContain(item.href);
    }
  }
  expect(routes).not.toContain("/portal");
});
