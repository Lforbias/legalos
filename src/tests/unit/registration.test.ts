import { describe, expect, it } from "vitest";
import { decideRegistration, registrationMode } from "@/lib/security/registration";

describe("política de cadastro", () => {
  it("modo: padrão aberto; código fraco ou ausente fecha; valor desconhecido cai no padrão aberto", () => {
    expect(registrationMode({})).toBe("open");
    expect(registrationMode({ REGISTRATION_MODE: "closed" })).toBe("closed");
    expect(registrationMode({ REGISTRATION_MODE: "code", REGISTRATION_CODE: "curto" })).toBe("closed");
    expect(registrationMode({ REGISTRATION_MODE: "code" })).toBe("closed");
    expect(registrationMode({ REGISTRATION_MODE: "CODE", REGISTRATION_CODE: "um-codigo-bem-longo" })).toBe("code");
  });
  it("aberto libera; convite libera em qualquer modo; fechado recusa", () => {
    expect(decideRegistration({ mode: "open", hasValidInvite: false }).allowed).toBe(true);
    expect(decideRegistration({ mode: "closed", hasValidInvite: true }).allowed).toBe(true);
    const d = decideRegistration({ mode: "closed", hasValidInvite: false });
    expect(d.allowed).toBe(false);
    expect(!d.allowed && d.reason).toMatch(/fechado/);
  });
  it("por código: só o código exato libera (e nunca vazio)", () => {
    const base = { mode: "code" as const, hasValidInvite: false, expectedCode: "um-codigo-bem-longo" };
    expect(decideRegistration({ ...base, accessCode: "um-codigo-bem-longo" }).allowed).toBe(true);
    expect(decideRegistration({ ...base, accessCode: " um-codigo-bem-longo " }).allowed).toBe(true);
    expect(decideRegistration({ ...base, accessCode: "errado" }).allowed).toBe(false);
    expect(decideRegistration({ ...base, accessCode: "" }).allowed).toBe(false);
    expect(decideRegistration({ ...base }).allowed).toBe(false);
    expect(decideRegistration({ mode: "code", hasValidInvite: false, accessCode: "", expectedCode: "" }).allowed).toBe(false);
  });
});
