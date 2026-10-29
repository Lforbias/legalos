import { describe, expect, it } from "vitest";
import { failureCodeForLogin } from "@/lib/judicial/robot-evidence";
import type { LoginFailureCode } from "@/lib/robots/pje/login";

describe("resultado do login do robô → falha comum dos conectores", () => {
  it("captcha, segundo fator e conta bloqueada pedem uma pessoa (nunca são contornados)", () => {
    expect(failureCodeForLogin("NEEDS_PERSON")).toBe("NEEDS_PERSON");
    expect(failureCodeForLogin("ACCOUNT_BLOCKED")).toBe("NEEDS_PERSON");
  });
  it("credencial recusada e código recusado são rejeição de acesso; falta de segundo fator é acesso exigido", () => {
    expect(failureCodeForLogin("BAD_CREDENTIALS")).toBe("AUTH_REJECTED");
    expect(failureCodeForLogin("OTP_REJECTED")).toBe("AUTH_REJECTED");
    expect(failureCodeForLogin("OTP_MISSING")).toBe("AUTH_REQUIRED");
    expect(failureCodeForLogin("OTP_NOT_CONFIGURED")).toBe("AUTH_REQUIRED");
  });
  it("tela desconhecida pausa por mudança de layout; rede e tempo são falhas temporárias", () => {
    expect(failureCodeForLogin("UNKNOWN_PAGE")).toBe("LAYOUT_CHANGED");
    expect(failureCodeForLogin("NETWORK")).toBe("UNAVAILABLE");
    expect(failureCodeForLogin("TIMEOUT")).toBe("TIMEOUT");
  });
  it("todos os códigos do robô têm tradução", () => {
    const all: LoginFailureCode[] = ["BAD_CREDENTIALS", "ACCOUNT_BLOCKED", "OTP_NOT_CONFIGURED", "OTP_MISSING", "OTP_REJECTED", "NEEDS_PERSON", "UNKNOWN_PAGE", "TIMEOUT", "NETWORK"];
    for (const c of all) expect(failureCodeForLogin(c)).toBeTruthy();
  });
});
