import { describe, expect, it, beforeEach } from "vitest";

/**
 * Testa o registry de adaptadores em isolamento.
 * O módulo usa um Map global, então reimportamos para cada teste.
 */
describe("adapter-registry", () => {
  // Use dynamic imports to get fresh modules
  it("registers and retrieves an adapter", async () => {
    // Test via the bootstrap which registers pje-portal
    const { ensureAdapters, getAdapter, listAdapters, findAdapterForCourt } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    const pje = getAdapter("pje-portal");
    expect(pje).not.toBeNull();
    expect(pje!.descriptor.key).toBe("pje-portal");
    expect(pje!.descriptor.engineFamily).toBe("PJE");
  });

  it("listAdapters returns at least the PJe adapter", async () => {
    const { ensureAdapters, listAdapters } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    const all = listAdapters();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.some((a) => a.descriptor.key === "pje-portal")).toBe(true);
  });

  it("findAdapterForCourt finds PJe adapter for TRF3", async () => {
    const { ensureAdapters, findAdapterForCourt } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    const adapter = findAdapterForCourt("TRF3", "1");
    expect(adapter).not.toBeNull();
    expect(adapter!.descriptor.key).toBe("pje-portal");
  });

  it("findAdapterForCourt returns null for unsupported court", async () => {
    const { ensureAdapters, findAdapterForCourt } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    const adapter = findAdapterForCourt("TJBA", "1");
    expect(adapter).toBeNull();
  });

  it("allSupportedTargets lists targets from all adapters", async () => {
    const { ensureAdapters, allSupportedTargets } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    const all = allSupportedTargets();
    expect(all.length).toBeGreaterThanOrEqual(5);
    const keys = new Set(all.map((t) => t.adapter.descriptor.key));
    expect(keys.has("pje-portal")).toBe(true);
    expect(keys.has("eproc-mni")).toBe(true);
    expect(keys.has("esaj-mni")).toBe(true);
    expect(keys.has("projudi-mni")).toBe(true);
  });

  it("pje adapter descriptor has correct capabilities", async () => {
    const { ensureAdapters, getAdapter } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    const pje = getAdapter("pje-portal")!;
    expect(pje.descriptor.capabilities.validateCredentials).toBe(true);
    expect(pje.descriptor.supportedAuthModes).toContain("PASSWORD");
    expect(pje.descriptor.supportedAuthModes).toContain("PASSWORD_OTP");
  });
});
