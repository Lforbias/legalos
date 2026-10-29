import { describe, expect, it } from "vitest";
import { describeDjenRun, plainFailure, ymdToBr } from "@/lib/judicial/plain";

const JARGON = /\b(SOAP|WSDL|endpoint|MNI|HTTP|token|payload|jobs?|webservice)\b/i;

describe("linguagem simples das falhas e resultados", () => {
  const CODES = ["UNAVAILABLE", "GEO_BLOCKED", "RATE_LIMITED", "AUTH_REQUIRED", "AUTH_EXPIRED", "AUTH_REJECTED", "NEEDS_PERSON", "LAYOUT_CHANGED", "UNSUPPORTED", "INVALID_RESPONSE", "TIMEOUT", "INTERNAL", "QUALQUER_OUTRO"];

  it("toda falha tem explicação e próximo passo, sem jargão técnico", () => {
    for (const code of CODES) {
      const f = plainFailure(code);
      expect(f.what.length, code).toBeGreaterThan(20);
      expect(f.next.length, code).toBeGreaterThan(10);
      expect(`${f.what} ${f.next}`, code).not.toMatch(JARGON);
    }
  });

  it("diferencia o que se resolve sozinho do que precisa de uma pessoa", () => {
    expect(plainFailure("UNAVAILABLE").automatic).toBe(true);
    expect(plainFailure("RATE_LIMITED").automatic).toBe(true);
    expect(plainFailure("AUTH_REJECTED").automatic).toBe(false);
    expect(plainFailure("NEEDS_PERSON").next).toMatch(/não contorna/);
    // bloqueio por país não é culpa do cadastro do advogado
    expect(plainFailure("GEO_BLOCKED").what).toMatch(/servidor do LegalOS/);
    expect(plainFailure("GEO_BLOCKED").next).toMatch(/Não é um erro do seu cadastro|não é um erro do seu cadastro/i);
  });

  it("resposta inesperada nunca é tratada como 'sem publicações'", () => {
    expect(plainFailure("INVALID_RESPONSE").next).toMatch(/não trata isso como “sem publicações”/);
  });

  it("formata datas ISO para o padrão brasileiro e preserva texto que não é data", () => {
    expect(ymdToBr("2026-10-28")).toBe("28/10/2026");
    expect(ymdToBr("amanhã")).toBe("amanhã");
  });

  it("consulta completa com publicações: conta novas e já conhecidas", () => {
    const o = describeDjenRun({ found: 5, imported: 3, alreadyKnown: 2, complete: true, from: "2026-10-21", to: "2026-10-28" });
    expect(o).toMatchObject({ tone: "success", title: "Consulta concluída" });
    expect(o.detail).toMatch(/5 publicação\(ões\) entre 21\/10\/2026 a 28\/10\/2026: 3 nova\(s\).* 2 que o LegalOS já tinha/);
  });

  it("consulta completa SEM publicações é válida, mas não promete mais do que provou", () => {
    const o = describeDjenRun({ found: 0, imported: 0, alreadyKnown: 0, complete: true, from: "2026-10-21", to: "2026-10-28" });
    expect(o).toMatchObject({ tone: "success", title: "A consulta funciona" });
    expect(o.detail).toMatch(/não há publicações/);
  });

  it("leitura parcial é aviso: a fonte não está em dia", () => {
    const o = describeDjenRun({ found: 200, imported: 200, alreadyKnown: 0, complete: false, from: "2026-10-21", to: "2026-10-28" });
    expect(o.tone).toBe("warning");
    expect(o.detail).toMatch(/não chegou ao fim/);
    expect(o.detail).toMatch(/não está em dia/);
  });
});
