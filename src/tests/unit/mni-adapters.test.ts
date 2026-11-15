import { describe, expect, it } from "vitest";
import type { AdapterContext, CourtTarget } from "@/lib/judicial/adapter";

function makeMockCtx(target: CourtTarget, hasCredentials = true): AdapterContext {
  return {
    organizationId: "org-test",
    userId: "user-test",
    target,
    authMode: "PASSWORD",
    openSecret: async () => hasCredentials
      ? { document: "12345678900", password: "test-pass" }
      : {},
    page: null,
  };
}

describe("eproc-adapter", () => {
  it("exports a valid TribunalAdapter", async () => {
    const { eprocAdapter } = await import("@/lib/robots/eproc/eproc-adapter");
    expect(eprocAdapter.descriptor.key).toBe("eproc-mni");
    expect(eprocAdapter.descriptor.engineFamily).toBe("EPROC");
    expect(eprocAdapter.descriptor.supportedAuthModes).toContain("PASSWORD");
    expect(eprocAdapter.descriptor.capabilities.validateCredentials).toBe(true);
  });

  it("declares targets for TRF2, TRF4, TJAC, TJRS, TJSC", async () => {
    const { eprocAdapter } = await import("@/lib/robots/eproc/eproc-adapter");
    const codes = new Set(eprocAdapter.descriptor.supportedTargets.map((t) => t.courtCode));
    expect(codes).toEqual(new Set(["TRF2", "TRF4", "TJAC", "TJRS", "TJSC"]));
  });

  it("returns INTERNAL when endpoint is not registered", async () => {
    const { eprocAdapter } = await import("@/lib/robots/eproc/eproc-adapter");
    const ctx = makeMockCtx({ courtCode: "TRF2", degree: "1", label: "TRF2 — 1º grau" });
    const result = await eprocAdapter.validateCredentials(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INTERNAL");
      expect(result.message).toContain("endpoint MNI");
    }
  });

  it("returns INTERNAL for missing credentials when endpoint is also null", async () => {
    const { eprocAdapter } = await import("@/lib/robots/eproc/eproc-adapter");
    const ctx = makeMockCtx({ courtCode: "TRF4", degree: "1", label: "TRF4 — 1º grau" }, false);
    const result = await eprocAdapter.validateCredentials(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INTERNAL");
    }
  });
});

describe("esaj-adapter", () => {
  it("exports a valid TribunalAdapter", async () => {
    const { esajAdapter } = await import("@/lib/robots/esaj/esaj-adapter");
    expect(esajAdapter.descriptor.key).toBe("esaj-mni");
    expect(esajAdapter.descriptor.engineFamily).toBe("ESAJ");
    expect(esajAdapter.descriptor.supportedAuthModes).toContain("PASSWORD");
    expect(esajAdapter.descriptor.capabilities.validateCredentials).toBe(true);
  });

  it("declares targets for TJSP and TJMS", async () => {
    const { esajAdapter } = await import("@/lib/robots/esaj/esaj-adapter");
    const codes = new Set(esajAdapter.descriptor.supportedTargets.map((t) => t.courtCode));
    expect(codes).toEqual(new Set(["TJSP", "TJMS"]));
  });

  it("returns INTERNAL when endpoint is not registered", async () => {
    const { esajAdapter } = await import("@/lib/robots/esaj/esaj-adapter");
    const ctx = makeMockCtx({ courtCode: "TJSP", degree: "1", label: "TJSP — 1º grau" });
    const result = await esajAdapter.validateCredentials(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INTERNAL");
      expect(result.message).toContain("endpoint MNI");
    }
  });
});

describe("projudi-adapter", () => {
  it("exports a valid TribunalAdapter", async () => {
    const { projudiAdapter } = await import("@/lib/robots/projudi/projudi-adapter");
    expect(projudiAdapter.descriptor.key).toBe("projudi-mni");
    expect(projudiAdapter.descriptor.engineFamily).toBe("PROJUDI");
    expect(projudiAdapter.descriptor.supportedAuthModes).toContain("PASSWORD");
    expect(projudiAdapter.descriptor.capabilities.validateCredentials).toBe(true);
  });

  it("declares targets for TJPR", async () => {
    const { projudiAdapter } = await import("@/lib/robots/projudi/projudi-adapter");
    const codes = new Set(projudiAdapter.descriptor.supportedTargets.map((t) => t.courtCode));
    expect(codes).toEqual(new Set(["TJPR"]));
  });

  it("returns INTERNAL when endpoint is not registered", async () => {
    const { projudiAdapter } = await import("@/lib/robots/projudi/projudi-adapter");
    const ctx = makeMockCtx({ courtCode: "TJPR", degree: "1", label: "TJPR — 1º grau" });
    const result = await projudiAdapter.validateCredentials(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INTERNAL");
      expect(result.message).toContain("endpoint MNI");
    }
  });
});

describe("bootstrap with all adapters", () => {
  it("registers all 4 adapters", async () => {
    const { ensureAdapters, listAdapters } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    const all = listAdapters();
    const keys = all.map((a) => a.descriptor.key).sort();
    expect(keys).toContain("pje-portal");
    expect(keys).toContain("eproc-mni");
    expect(keys).toContain("esaj-mni");
    expect(keys).toContain("projudi-mni");
  });

  it("findAdapterForCourt resolves eproc courts", async () => {
    const { ensureAdapters, findAdapterForCourt } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    expect(findAdapterForCourt("TRF2", "1")?.descriptor.key).toBe("eproc-mni");
    expect(findAdapterForCourt("TJRS", "2")?.descriptor.key).toBe("eproc-mni");
  });

  it("findAdapterForCourt resolves esaj courts", async () => {
    const { ensureAdapters, findAdapterForCourt } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    expect(findAdapterForCourt("TJSP", "1")?.descriptor.key).toBe("esaj-mni");
    expect(findAdapterForCourt("TJMS", "2")?.descriptor.key).toBe("esaj-mni");
  });

  it("findAdapterForCourt resolves projudi courts", async () => {
    const { ensureAdapters, findAdapterForCourt } = await import("@/lib/judicial/adapter-bootstrap");
    ensureAdapters();

    expect(findAdapterForCourt("TJPR", "1")?.descriptor.key).toBe("projudi-mni");
  });
});
