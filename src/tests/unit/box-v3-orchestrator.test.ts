import { describe, expect, it, vi } from "vitest";
import { classifyThrown } from "@/lib/box-v3/core";
import { runCapability } from "@/server/judicial/orchestrator";

class FakeError extends Error {
  constructor(message: string, readonly code: string, readonly retryable = false) {
    super(message);
  }
}

describe("Box 3.0: classificação de erro de conector", () => {
  it("lê code/retryable de qualquer erro de cliente externo", () => {
    expect(classifyThrown(new FakeError("x", "RATE_LIMIT", true))).toEqual({ reasonCode: "RATE_LIMIT", retryable: true });
    expect(classifyThrown(new FakeError("x", "TIMEOUT"))).toEqual({ reasonCode: "TIMEOUT", retryable: false });
  });
  it("erro sem code vira INTERNAL, nunca inventa um motivo específico", () => {
    expect(classifyThrown(new Error("algo quebrou"))).toEqual({ reasonCode: "INTERNAL", retryable: false });
    expect(classifyThrown("string solta")).toEqual({ reasonCode: "INTERNAL", retryable: false });
    expect(classifyThrown(null)).toEqual({ reasonCode: "INTERNAL", retryable: false });
  });
});

describe("Box 3.0: orquestrador (runCapability)", () => {
  it("devolve o resultado real e grava evidência PASSED por padrão", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const result = await runCapability(
      { organizationId: "org-1", connectorKey: "datajud", operation: "getCase", accessMethod: "OFFICIAL_API", record },
      async () => ({ found: true }),
    );
    expect(result).toEqual({ found: true });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0]).toMatchObject({ organizationId: "org-1", connectorKey: "datajud", operation: "getCase", courtCode: "*", outcome: "PASSED" });
  });

  it("usa outcomeOf para distinguir resultado sem exceção (ex.: não encontrado = INCONCLUSIVE)", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    await runCapability(
      {
        organizationId: "org-1",
        connectorKey: "datajud",
        operation: "getCase",
        accessMethod: "OFFICIAL_API",
        courtCode: "tjsp",
        record,
        outcomeOf: (r: { found: boolean }) => ({ outcome: r.found ? "PASSED" : "INCONCLUSIVE", summary: r.found ? "achou" : "não achou" }),
      },
      async () => ({ found: false }),
    );
    expect(record.mock.calls[0]![0]).toMatchObject({ courtCode: "tjsp", outcome: "INCONCLUSIVE", summary: "não achou" });
  });

  it("em falha real: relança o erro original e grava FAILED com o reasonCode do erro", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const boom = new FakeError("O serviço caiu", "UNAVAILABLE", true);
    await expect(
      runCapability({ organizationId: "org-1", connectorKey: "datajud", operation: "checkAvailability", accessMethod: "OFFICIAL_API", record }, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(record.mock.calls[0]![0]).toMatchObject({ outcome: "FAILED", reasonCode: "UNAVAILABLE", summary: "O serviço caiu" });
  });

  it("uma falha ao GRAVAR a evidência nunca derruba a operação real (sucesso ou erro)", async () => {
    const record = vi.fn().mockRejectedValue(new Error("banco fora do ar"));
    await expect(runCapability({ organizationId: null, connectorKey: "datajud", operation: "getCase", accessMethod: "OFFICIAL_API", record }, async () => "ok")).resolves.toBe("ok");
    await expect(
      runCapability({ organizationId: null, connectorKey: "datajud", operation: "getCase", accessMethod: "OFFICIAL_API", record }, async () => {
        throw new Error("falha real");
      }),
    ).rejects.toThrow("falha real");
  });
});
