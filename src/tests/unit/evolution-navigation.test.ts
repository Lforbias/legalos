import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/config/navigation";
import {
  DEPARTMENTS,
  EVOLUTION_NAV,
  ROUTE_MATRIX,
  departmentItems,
  expandVisibleKeys,
  type Department,
} from "@/config/evolution-navigation";

describe("evolution navigation config", () => {
  const allDepts: Department[] = ["lobby", "mesa", "juridico", "controladoria", "atendimento", "comercial", "financeiro", "administracao"];

  it("defines all eight departments with name, color, icon and summary", () => {
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

  it("existingRoute items have hrefs pointing to Ethos (no /evolution prefix)", () => {
    for (const item of EVOLUTION_NAV.filter((n) => n.existingRoute)) {
      expect(item.href).not.toMatch(/^\/evolution/);
    }
  });

  it("non-existingRoute items point to /evolution/*", () => {
    for (const item of EVOLUTION_NAV.filter((n) => !n.existingRoute)) {
      expect(item.href).toMatch(/^\/evolution/);
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

describe("expandVisibleKeys", () => {
  it("adds corresponding Ethos keys for Evolution nav items", () => {
    const keys = expandVisibleKeys(["evo-mesa-tarefas", "evo-juridico-processos"]);
    expect(keys).toContain("evo-mesa-tarefas");
    expect(keys).toContain("tasks");
    expect(keys).toContain("cases");
  });

  it("requires the visible Desktop shortcut but always includes overview", () => {
    const keys = expandVisibleKeys([]);
    expect(keys).not.toContain("workspace");
    expect(expandVisibleKeys(["evo-mesa-workspace"])).toContain("workspace");
    expect(keys).toContain("overview");
  });

  it("does not duplicate keys", () => {
    const keys = expandVisibleKeys(["evo-mesa-tarefas", "evo-mesa-tarefas"]);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});

describe("route matrix", () => {
  it("covers all main Ethos routes", () => {
    const covered = ROUTE_MATRIX.map((r) => r.ethos);
    expect(covered).toContain("/processos");
    expect(covered).toContain("/tarefas");
    expect(covered).toContain("/financeiro");
    expect(covered).toContain("/configuracoes");
  });

  it("references only valid departments", () => {
    for (const entry of ROUTE_MATRIX) {
      if (entry.evolution !== "external") expect(Object.keys(DEPARTMENTS)).toContain(entry.evolution);
    }
  });

  it("covers every internal Ethos route and links it from Evolution", () => {
    const internalRoutes = NAV_ITEMS.filter((item) =>
      (item.space === "func" || item.space === "chat") &&
      !item.box &&
      !["overview", "portal", "prototypes", "help"].includes(item.key),
    );
    const matrixRoutes = new Set(ROUTE_MATRIX.map((entry) => entry.ethos));
    const evolutionRoutes = new Set(EVOLUTION_NAV.filter((item) => item.existingRoute).map((item) => item.href));

    for (const item of internalRoutes) {
      expect(matrixRoutes, `${item.key} missing from route matrix`).toContain(item.href);
      expect(evolutionRoutes, `${item.key} missing from Evolution navigation`).toContain(item.href);
    }
  });

  it("keeps the authenticated client portal outside staff navigation", () => {
    expect(ROUTE_MATRIX.find((entry) => entry.ethos === "/portal")?.evolution).toBe("external");
    expect(EVOLUTION_NAV.some((item) => item.href === "/portal" || item.permission === "portal:access")).toBe(false);
  });
});
