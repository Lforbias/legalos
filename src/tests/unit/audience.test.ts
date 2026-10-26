import { describe, it, expect } from "vitest";
import {
  sensitiveData,
  officialUrl,
  toolSchema,
  signupSchema,
  safePublicText,
  escapeXml,
} from "@/lib/audience/policy";
import { calculatePublic } from "@/server/audience/tools";
import { resultPdf } from "@/server/audience/pdf";
import { PDFDocument } from "pdf-lib";
describe("Public audience safeguards", () => {
  it.each([
    "123.456.789-00",
    "12345678900",
    "12.345.678/0001-90",
    "12345678000190",
    "12.ABC.345/01DE-35",
    "0001234-56.2026.8.26.0100",
    "00012345620268260100",
  ])("detects confidential identifier %s", (v) =>
    expect(sensitiveData("Meu caso " + v)).toBeTruthy(),
  );
  it("accepts an anonymous professional question", () =>
    expect(() =>
      safePublicText("Como vocês organizam a revisão de peças na equipe?"),
    ).not.toThrow());
  it("limits link spam", () =>
    expect(() => safePublicText("https://a.com https://b.com")).toThrow());
  it.each([
    "https://www.stj.jus.br/a",
    "https://www.planalto.gov.br/ccivil_03/",
  ])("accepts official %s", (url) => expect(officialUrl(url)).toBe(true));
  it.each([
    "http://www.stj.jus.br",
    "https://www.stj.jus.br.evil.com",
    "https://evil.gov.br@evil.com",
    "file:///tmp/a",
  ])("rejects unofficial %s", (url) => expect(officialUrl(url)).toBe(false));
  it("requires explicit independent consents", () => {
    expect(
      signupSchema.safeParse({
        name: "Colega",
        email: "a@example.com",
        origin: "blog",
        terms: true,
      }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({
        name: "Colega",
        email: "a@example.com",
        origin: "blog",
        terms: true,
        marketing: false,
      }).success,
    ).toBe(true);
    expect(
      signupSchema.safeParse({
        name: "Colega",
        email: "a@example.com",
        origin: "blog",
        terms: false,
        marketing: true,
      }).success,
    ).toBe(false);
  });
  it.each([
    "2026-02-30",
    "2025-02-29",
    "2026-99-10",
    "2026-00-01",
    "0000-01-01",
  ])("rejects invalid dates before entering the date engine %s", (startDate) =>
    expect(
      toolSchema.safeParse({
        tool: "prazos",
        startDate,
        days: 15,
        countType: "BUSINESS",
      }).success,
    ).toBe(false),
  );
  it("caps anonymous calculation work", () =>
    expect(
      toolSchema.safeParse({
        tool: "prazos",
        startDate: "2026-10-05",
        days: 999999,
        countType: "BUSINESS",
      }).success,
    ).toBe(false));
  it("computes from the existing engine with explicit limitations", () => {
    const { result } = calculatePublic({
      tool: "prazos",
      startDate: "2026-10-05",
      days: 15,
      countType: "BUSINESS",
    });
    expect(result.summary).toContainEqual([
      "VENCIMENTO SUGERIDO",
      "2026-10-27",
    ]);
    expect(result.warnings.join(" ")).toContain("feriados locais");
  });
  it("rejects reversed employment dates", () =>
    expect(() =>
      calculatePublic({
        tool: "rescisao",
        admissao: "2026-10-26",
        demissao: "2026-10-01",
        salario: "2000",
        tipo: "ACORDO",
        feriasVencidas: 0,
      }),
    ).toThrow());
  it("generates a readable multipage PDF including long memory", async () => {
    const { result } = calculatePublic({
      tool: "prazos",
      startDate: "2026-10-05",
      days: 365,
      countType: "BUSINESS",
    });
    const bytes = await resultPdf(result);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe(result.title);
  });
  it("escapes RSS and XML text", () =>
    expect(escapeXml("<script>&")).toBe("&lt;script&gt;&amp;"));
});
