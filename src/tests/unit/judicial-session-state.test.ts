import { describe, expect, it } from "vitest";
import { courtConnectionSessionState, portalAccessSessionState } from "@/lib/judicial/session-state";

describe("courtConnectionSessionState (MNI/SOAP, sem sessão viva entre chamadas)", () => {
  it("sem contrato verificado ainda = configuração pendente, mesmo ligado", () => {
    expect(courtConnectionSessionState({ enabled: true, wsdlStatus: null, lastStatus: null })).toBe("configuration_required");
  });
  it("contrato incompatível = erro, independente de ligado/desligado", () => {
    expect(courtConnectionSessionState({ enabled: true, wsdlStatus: "INCOMPATIBLE", lastStatus: null })).toBe("error");
    expect(courtConnectionSessionState({ enabled: false, wsdlStatus: "INCOMPATIBLE", lastStatus: "OK" })).toBe("error");
  });
  it("contrato compatível mas desligado = não configurado (não assume reativação automática)", () => {
    expect(courtConnectionSessionState({ enabled: false, wsdlStatus: "COMPATIBLE", lastStatus: "OK" })).toBe("not_configured");
  });
  it("última consulta OK = autenticado (no sentido de 'última tentativa', não sessão viva)", () => {
    expect(courtConnectionSessionState({ enabled: true, wsdlStatus: "COMPATIBLE", lastStatus: "OK" })).toBe("authenticated");
  });
  it("última consulta com erro = degradado, não 'error' definitivo (continua ligado para nova tentativa)", () => {
    expect(courtConnectionSessionState({ enabled: true, wsdlStatus: "COMPATIBLE", lastStatus: "ERROR" })).toBe("degraded");
  });
});

describe("portalAccessSessionState (robô Playwright, reautentica a cada trabalho)", () => {
  it("desligado = não configurado, não importa o status salvo", () => {
    expect(portalAccessSessionState({ enabled: false, status: "CONNECTED" })).toBe("not_configured");
  });
  it("mapeia PENDING/CONNECTING/NEEDS_ACTION/CONNECTED/ERROR do robô", () => {
    expect(portalAccessSessionState({ enabled: true, status: "PENDING" })).toBe("configuration_required");
    expect(portalAccessSessionState({ enabled: true, status: "CONNECTING" })).toBe("authenticating");
    expect(portalAccessSessionState({ enabled: true, status: "NEEDS_ACTION" })).toBe("human_action_required");
    expect(portalAccessSessionState({ enabled: true, status: "CONNECTED" })).toBe("authenticated");
    expect(portalAccessSessionState({ enabled: true, status: "ERROR" })).toBe("degraded");
  });
  it("status desconhecido nunca é tratado como autenticado: cai em erro", () => {
    expect(portalAccessSessionState({ enabled: true, status: "ALGO_NOVO" })).toBe("error");
  });
});
