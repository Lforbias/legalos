import { describe, expect, it } from "vitest";
import { deriveConnection } from "@/lib/judicial/connection-state";
import { MONITORING_CAPABILITIES } from "@/lib/judicial/contracts";
import { coverageLevelOf, homologationOf, coverageMatrix, isLocalOrFakeUrl, type EvidenceRow } from "@/lib/judicial/evidence";
import { CONNECTORS, getConnector, implementedCapabilities, isImplemented } from "@/lib/judicial/catalog";

const now = new Date("2026-10-28T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const ev = (o: Partial<EvidenceRow> & Pick<EvidenceRow, "operation" | "outcome">): EvidenceRow => ({ connectorKey: "djen", courtCode: "*", accessMethod: "PUBLIC", environment: "PRODUCTION", reasonCode: null, checkedAt: ago(5), ...o });
const base = { connectorKey: "djen", requiredOps: MONITORING_CAPABILITIES, courtCode: "*", authorization: "NOT_REQUIRED" as const, now };

describe("catálogo: implementado ≠ comprovado", () => {
  it("o DJEN só declara o que existe em código", () => {
    expect(implementedCapabilities(getConnector("djen")!).sort()).toEqual(["checkAvailability", "listNotices"]);
    expect(isImplemented("djen", "submitFiling")).toBe(false);
  });
  it("nenhum conector declara protocolo/comprovante sem implementação real", () => {
    for (const c of CONNECTORS) for (const op of ["getOfficialReceipt", "checkFilingStatus"] as const) expect(c.capabilities[op].implemented).toBe(false);
  });
  it("eproc, e-SAJ e PROJUDI não presumem MNI nem intimações", () => {
    expect(isImplemented("esaj", "listNotices")).toBe(false);
    expect(isImplemented("projudi", "listNotices")).toBe(false);
    expect(getConnector("domicilio-judicial")).toBeTruthy();
    expect(implementedCapabilities(getConnector("domicilio-judicial")!)).toEqual([]);
  });
});

describe("estado da conexão é derivado de evidência", () => {
  it("sem nenhuma evidência: NÃO homologado (nunca 'conectado' só por existir o cadastro)", () => {
    const r = deriveConnection({ ...base, evidence: [] });
    expect(r.state).toBe("NOT_HOMOLOGATED");
    expect(r.missing.sort()).toEqual(["checkAvailability", "listNotices"]);
  });
  it("evidência SIMULADA nunca conta como prova", () => {
    const r = deriveConnection({ ...base, evidence: [ev({ operation: "checkAvailability", outcome: "PASSED", environment: "SIMULATED" }), ev({ operation: "listNotices", outcome: "PASSED", environment: "SIMULATED" })] });
    expect(r.state).toBe("NOT_HOMOLOGATED");
  });
  it("tudo exigido comprovado e recente: operacional", () => {
    const r = deriveConnection({ ...base, evidence: [ev({ operation: "checkAvailability", outcome: "PASSED" }), ev({ operation: "listNotices", outcome: "PASSED" })] });
    expect(r.state).toBe("OPERATIONAL");
    expect(r.nextAction).toBeNull();
  });
  it("evidência vencida deixa de provar (listNotices vale 6 h)", () => {
    const r = deriveConnection({ ...base, evidence: [ev({ operation: "checkAvailability", outcome: "PASSED" }), ev({ operation: "listNotices", outcome: "PASSED", checkedAt: ago(7 * 60) })] });
    expect(r.state).toBe("PARTIAL");
    expect(r.missing).toContain("listNotices");
  });
  it("só o serviço respondeu, mas a consulta não foi concluída: parcial", () => {
    const r = deriveConnection({ ...base, evidence: [ev({ operation: "checkAvailability", outcome: "PASSED" }), ev({ operation: "listNotices", outcome: "INCONCLUSIVE", reasonCode: "COUNT_MISMATCH" })] });
    expect(r.state).toBe("PARTIAL");
  });
  it("bloqueio por país é indisponível, com mensagem clara e sem jargão", () => {
    const r = deriveConnection({ ...base, evidence: [ev({ operation: "checkAvailability", outcome: "FAILED", reasonCode: "GEO_BLOCKED" })] });
    expect(r.state).toBe("UNAVAILABLE");
    expect(r.reason).toBe("GEO_BLOCKED");
    expect(r.headline).not.toMatch(/SOAP|WSDL|endpoint|HTTP/i);
  });
  it("falha de rede/limite é temporária", () => {
    for (const code of ["TIMEOUT", "UNAVAILABLE", "RATE_LIMITED"]) {
      expect(deriveConnection({ ...base, evidence: [ev({ operation: "listNotices", outcome: "FAILED", reasonCode: code })] }).state).toBe("TEMPORARY_FAILURE");
    }
  });
  it("mudança de formato pausa a captura (não registra dados errados)", () => {
    const r = deriveConnection({ ...base, evidence: [ev({ operation: "listNotices", outcome: "FAILED", reasonCode: "INVALID_RESPONSE" })] });
    expect(r.state).toBe("UNAVAILABLE");
    expect(r.headline).toMatch(/mudou de formato/);
  });
  it("conector privado: sem autorização, nenhuma evidência salva o estado", () => {
    const e = [ev({ connectorKey: "pje-mni", operation: "listNotices", outcome: "PASSED" })];
    const r = deriveConnection({ connectorKey: "pje-mni", requiredOps: ["listNotices"], courtCode: "*", authorization: "MISSING", evidence: e, now });
    expect(r.state).toBe("NEEDS_AUTHORIZATION");
    expect(deriveConnection({ connectorKey: "pje-mni", requiredOps: ["listNotices"], courtCode: "*", authorization: "EXPIRED", evidence: e, now }).state).toBe("AUTH_EXPIRED");
  });
  it("captcha/2º fator pede uma pessoa (nunca é contornado)", () => {
    const r = deriveConnection({ connectorKey: "pje-mni", requiredOps: ["listNotices"], courtCode: "*", authorization: "GRANTED", evidence: [ev({ connectorKey: "pje-mni", operation: "listNotices", outcome: "FAILED", reasonCode: "NEEDS_PERSON" })], now });
    expect(r.state).toBe("NEEDS_AUTHORIZATION");
    expect(r.reason).toBe("NEEDS_PERSON");
  });
  it("capacidade não implementada: indisponível e explica o que fazer", () => {
    const r = deriveConnection({ connectorKey: "esaj", requiredOps: ["listNotices"], courtCode: "*", authorization: "GRANTED", evidence: [], now });
    expect(r.state).toBe("UNAVAILABLE");
    expect(r.reason).toBe("NOT_IMPLEMENTED");
    expect(r.nextAction).toMatch(/portal/i);
  });
  it("evidência de outro tribunal não prova este", () => {
    const e = [ev({ connectorKey: "pje-mni", courtCode: "TRT5", operation: "listNotices", outcome: "PASSED" })];
    const r = deriveConnection({ connectorKey: "pje-mni", requiredOps: ["listNotices"], courtCode: "TRF3", authorization: "GRANTED", evidence: e, now });
    expect(r.state).toBe("NOT_HOMOLOGATED");
  });
});

describe("homologação e cobertura por tribunal/operação", () => {
  it("estados de homologação", () => {
    expect(homologationOf("djen", "submitFiling", [], now)).toBe("NOT_IMPLEMENTED");
    expect(homologationOf("djen", "listNotices", [], now)).toBe("UNVALIDATED");
    expect(homologationOf("djen", "listNotices", [ev({ operation: "listNotices", outcome: "PASSED" })], now)).toBe("VALIDATED");
    expect(homologationOf("djen", "listNotices", [ev({ operation: "listNotices", outcome: "PASSED", checkedAt: ago(24 * 60) })], now)).toBe("STALE");
    expect(homologationOf("djen", "listNotices", [ev({ operation: "listNotices", outcome: "FAILED", reasonCode: "TIMEOUT" })], now)).toBe("FAILING");
  });
  it("a matriz não inventa cobertura nacional: só linhas de operações implementadas", () => {
    const m = coverageMatrix([], now);
    expect(m.every((r) => getConnector(r.connectorKey)!.capabilities[r.operation].implemented)).toBe(true);
    expect(m.every((r) => r.state === "UNVALIDATED")).toBe(true);
    expect(m.some((r) => r.connectorKey === "esaj")).toBe(false);
  });
  it("níveis de cobertura distinguem serviço no ar de captura comprovada", () => {
    expect(coverageLevelOf({ reachable: true, queryCompleted: false, partial: false, itemsEverCaptured: 0 })).toBe("SERVICE_REACHABLE");
    expect(coverageLevelOf({ reachable: true, queryCompleted: true, partial: false, itemsEverCaptured: 0 })).toBe("QUERY_COMPLETED");
    expect(coverageLevelOf({ reachable: true, queryCompleted: true, partial: false, itemsEverCaptured: 3 })).toBe("CAPTURE_PROVEN");
    expect(coverageLevelOf({ reachable: true, queryCompleted: false, partial: true, itemsEverCaptured: 3 })).toBe("PARTIAL_SYNC");
    expect(coverageLevelOf({ reachable: true, queryCompleted: true, partial: false, itemsEverCaptured: 3, verifiable: false })).toBe("NOT_VERIFIABLE");
  });
});

describe("endereço local ou fictício nunca prova uma fonte real", () => {
  it("reconhece localhost, loopback e domínios reservados; endereço ilegível conta como fictício", () => {
    for (const u of ["http://localhost:3197", "http://127.0.0.1:3198/x", "http://[::1]:80", "https://tribunal.test/mni", "https://x.invalid", "https://exemplo.example", "https://app.localhost", "isso-nao-e-url"]) expect(isLocalOrFakeUrl(u), u).toBe(true);
    for (const u of ["https://comunicaapi.pje.jus.br/api/v1", "https://pje.trf3.jus.br/pje/intercomunicacao"]) expect(isLocalOrFakeUrl(u), u).toBe(false);
  });
});
