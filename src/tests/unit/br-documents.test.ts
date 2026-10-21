import { describe, expect, it } from "vitest";
import {
  CNJ_SEGMENTS,
  computeCnjCheck,
  formatCnj,
  formatCnpj,
  formatCpf,
  isValidCnj,
  isValidCnpj,
  isValidCpf,
  normalizeDocument,
  parseCnj,
} from "@/lib/validation/br-documents";

describe("CPF", () => {
  it("aceita CPFs válidos com e sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  it("rejeita dígito errado, sequências repetidas e tamanho incorreto", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
  it("formata", () => expect(formatCpf("52998224725")).toBe("529.982.247-25"));
});

describe("CNPJ", () => {
  it("aceita CNPJ numérico válido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
  it("aceita CNPJ alfanumérico válido (exemplo oficial 12.ABC.345/01DE-35)", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
  });
  it("rejeita inválidos", () => {
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-34")).toBe(false);
    expect(isValidCnpj("1234")).toBe(false);
  });
  it("formata", () => expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81"));
});

describe("normalizeDocument", () => {
  it("normaliza por tipo de pessoa e rejeita documento do tipo errado", () => {
    expect(normalizeDocument("PERSON", "529.982.247-25")).toBe("52998224725");
    expect(normalizeDocument("COMPANY", "11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeDocument("PERSON", "11.222.333/0001-81")).toBeNull();
    expect(normalizeDocument("COMPANY", "529.982.247-25")).toBeNull();
  });
});

describe("Número CNJ", () => {
  const base = { sequence: "0001234", year: "2023", segment: "8", court: "26", origin: "0100" };
  const check = computeCnjCheck(base);
  const number = `${base.sequence}-${check}.${base.year}.${base.segment}.${base.court}.${base.origin}`;

  it("valida número com dígito verificador correto, com e sem máscara", () => {
    expect(isValidCnj(number)).toBe(true);
    expect(isValidCnj(number.replace(/\D/g, ""))).toBe(true);
  });
  it("rejeita dígito verificador errado e formato inválido", () => {
    const wrong = String((Number(check) + 1) % 97).padStart(2, "0");
    expect(isValidCnj(`${base.sequence}-${wrong}.${base.year}.${base.segment}.${base.court}.${base.origin}`)).toBe(false);
    expect(isValidCnj("1234")).toBe(false);
    expect(isValidCnj("abc")).toBe(false);
  });
  it("interpreta e formata", () => {
    expect(parseCnj(number)?.court).toBe("26");
    expect(formatCnj(number.replace(/\D/g, ""))).toBe(number);
    expect(CNJ_SEGMENTS["8"]).toContain("Estados");
  });
});
