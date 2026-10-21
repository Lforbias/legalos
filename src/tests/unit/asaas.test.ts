import { describe, expect, it } from "vitest";
import { addOneMonth, asaasConfigFromEnv, paymentOutcome } from "@/lib/billing/asaas";
import { renderMail } from "@/lib/mail/layout";
import { checkProductionEnv } from "@/lib/config/prod-check";

describe("Asaas: configuração e regras puras", () => {
  it("exige chave e token longo; sandbox é o padrão", () => {
    expect(asaasConfigFromEnv({}).error).toMatch(/ASAAS_API_KEY/);
    expect(asaasConfigFromEnv({ ASAAS_API_KEY: "k" }).error).toMatch(/ASAAS_WEBHOOK_TOKEN/);
    expect(asaasConfigFromEnv({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "curto" }).error).toMatch(/mínimo 24/);
    const ok = asaasConfigFromEnv({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "x".repeat(24) });
    expect(ok.config).toMatchObject({ sandbox: true, baseUrl: "https://api-sandbox.asaas.com/v3" });
    expect(asaasConfigFromEnv({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "x".repeat(24), ASAAS_ENV: "production" }).config).toMatchObject({ sandbox: false, baseUrl: "https://api.asaas.com/v3" });
    expect(asaasConfigFromEnv({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "x".repeat(24), ASAAS_ENV: "xx" }).error).toMatch(/sandbox ou production/);
  });
  it("classifica o estado da fatura", () => {
    for (const s of ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]) expect(paymentOutcome(s)).toBe("paid");
    expect(paymentOutcome("OVERDUE")).toBe("overdue");
    expect(paymentOutcome("REFUNDED")).toBe("revoked");
    expect(paymentOutcome("CHARGEBACK_REQUESTED")).toBe("revoked");
    expect(paymentOutcome("PENDING")).toBe("pending");
    expect(paymentOutcome("QUALQUER_NOVO")).toBe("pending");
  });
  it("soma um mês preservando fim de mês", () => {
    const f = (s: string) => addOneMonth(s).toISOString().slice(0, 10);
    expect(f("2026-01-15")).toBe("2026-02-15");
    expect(f("2026-01-31")).toBe("2026-02-28");
    expect(f("2028-01-31")).toBe("2028-02-29");
    expect(f("2026-12-10")).toBe("2027-01-10");
  });
  it("e-mail: escapa HTML, só aceita http(s) no botão", () => {
    const m = renderMail({ title: "<b>x</b>", paragraphs: ["a & b"], button: { label: "Ir", url: "https://a.test/x?y=1&z=2" } });
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(m.html).toContain("a &amp; b");
    expect(m.text).toContain("Ir: https://a.test/x?y=1&z=2");
    expect(() => renderMail({ title: "t", paragraphs: [], button: { label: "x", url: "javascript:alert(1)" } })).toThrow();
  });
  it("check:prod avisa de cobrança desligada/sandbox e erra quando incompleta", () => {
    const base = { NODE_ENV: "production", APP_URL: "https://a.com", DATABASE_URL: "postgresql://u:p@db.exemplo.com:5432/x?sslmode=require" };
    const c = (extra: Record<string, string>) => checkProductionEnv({ ...base, ...extra }).map((i) => `${i.level}:${i.code}`);
    expect(c({})).toContain("warn:ASAAS_OFF");
    expect(c({ ASAAS_API_KEY: "k" })).toContain("error:ASAAS");
    expect(c({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "x".repeat(30) })).toContain("warn:ASAAS_SANDBOX");
    expect(c({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "x".repeat(30), ASAAS_ENV: "production", ASAAS_API_URL: "http://x" })).toContain("error:ASAAS_URL");
  });
});
