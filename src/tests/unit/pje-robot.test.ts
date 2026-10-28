import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, backoffMs, mapOutcome } from "@/lib/robots/pje/outcome";
import { redactText, sanitizeSignature } from "@/lib/robots/pje/signature";
import { PJE_TARGETS, getPjeTarget, pjeLoginUrl } from "@/lib/robots/pje/targets";
import type { LoginOutcome } from "@/lib/robots/pje/login";

const fail = (code: Extract<LoginOutcome, { ok: false }>["code"], retryable = false): LoginOutcome => ({ ok: false, code, message: `msg ${code}`, retryable, signature: null });

describe("assinatura de tela do robô", () => {
  it("tira números longos e o nome da pessoa", () => {
    expect(redactText("Bem-vinda, Talita Silva de Brito! CPF 123.456.789-00, processo 1234567-89.2024.4.01.3300", ["Talita Silva de Brito"])).not.toMatch(/Talita|Silva|Brito|\d{3,}/i);
  });
  it("sanitiza a assinatura inteira e limita tamanhos", () => {
    const sig = sanitizeSignature({ host: "pje1g.trf1.jus.br", path: "/pje/Painel;jsessionid=ABC123/advogado.seam", title: "Painel de Talita 12345", headings: Array.from({ length: 20 }, (_, i) => `h${i}`), fields: ["input:text:usuario"], buttons: [] }, ["Talita"]);
    expect(sig.path).not.toMatch(/jsessionid/i);
    expect(sig.title).not.toMatch(/Talita|12345/);
    expect(sig.headings).toHaveLength(8);
  });
});

describe("resultado do login → estado do acesso", () => {
  it("login ok conecta", () => {
    expect(mapOutcome({ ok: true, signature: { host: "x", path: "", title: "", headings: [], fields: [], buttons: [] } }, 1)).toMatchObject({ accessStatus: "CONNECTED", jobStatus: "DONE" });
  });
  it("senha recusada pede ação e NÃO repete", () => {
    const m = mapOutcome(fail("BAD_CREDENTIALS"), 1);
    expect(m).toMatchObject({ accessStatus: "NEEDS_ACTION", jobStatus: "WAITING_PERSON" });
    expect(m.retry).toBeUndefined();
  });
  it("bloqueio desliga o acesso", () => {
    expect(mapOutcome(fail("ACCOUNT_BLOCKED"), 1)).toMatchObject({ accessStatus: "NEEDS_ACTION", disable: true });
  });
  it("captcha, 2º fator ausente ou recusado pedem ação da pessoa", () => {
    for (const c of ["NEEDS_PERSON", "OTP_MISSING", "OTP_REJECTED", "OTP_NOT_CONFIGURED"] as const) expect(mapOutcome(fail(c), 1)).toMatchObject({ accessStatus: "NEEDS_ACTION", jobStatus: "WAITING_PERSON" });
  });
  it("tela desconhecida é erro nosso (não repete)", () => {
    expect(mapOutcome(fail("UNKNOWN_PAGE"), 1)).toMatchObject({ accessStatus: "ERROR", jobStatus: "FAILED" });
  });
  it("falha de rede repete até o limite e depois para", () => {
    expect(mapOutcome(fail("NETWORK", true), 1)).toMatchObject({ retry: true, jobStatus: "QUEUED" });
    expect(mapOutcome(fail("TIMEOUT", true), MAX_ATTEMPTS - 1).retry).toBe(true);
    expect(mapOutcome(fail("NETWORK", true), MAX_ATTEMPTS)).toMatchObject({ accessStatus: "ERROR", jobStatus: "FAILED" });
  });
  it("espera cresce e tem teto", () => {
    expect(backoffMs(1)).toBe(2 * 60_000);
    expect(backoffMs(2)).toBe(4 * 60_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
  });
});

describe("destinos do PJe", () => {
  it("só destinos conferidos, em HTTPS, sem endereço livre", () => {
    expect(PJE_TARGETS.length).toBeGreaterThan(0);
    for (const t of PJE_TARGETS) {
      expect(t.origin).toMatch(/^https:\/\/[a-z0-9.-]+\.jus\.br$/);
      expect(getPjeTarget(t.key)).toBe(t);
      expect(pjeLoginUrl(t)).toBe(`${t.origin}/pje/login.seam`);
    }
    expect(getPjeTarget("http://evil.example")).toBeNull();
  });
});
