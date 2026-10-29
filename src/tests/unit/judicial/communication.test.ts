import { describe, expect, it } from "vitest";
import { cnjFromDigits, decideCaseMatch, hashRaw, kindFromSource, sourceKeyOf, stableStringify } from "@/lib/judicial/communication";
import { normalizeDjenItem } from "@/lib/djen/adapter";
import { parseDjenItem } from "@/lib/djen/client";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { djenItem } from "../../fixtures/djen-samples";

const cnj = `0002345-${computeCnjCheck({ sequence: "0002345", year: "2024", segment: "5", court: "05", origin: "0001" })}.2024.5.05.0001`;
const digits = cnj.replace(/\D/g, "");

describe("normalização de comunicações", () => {
  it("o hash do bruto não depende da ordem das chaves e muda quando o conteúdo muda", () => {
    expect(hashRaw({ a: 1, b: [1, 2] })).toBe(hashRaw({ b: [1, 2], a: 1 }));
    expect(hashRaw({ a: 1 })).not.toBe(hashRaw({ a: 2 }));
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
  });
  it("a chave de idempotência mantém o formato legado e separa fontes", () => {
    expect(sourceKeyOf("djen", "123")).toBe("djen:123");
    expect(sourceKeyOf("pje", "123")).not.toBe(sourceKeyOf("djen", "123"));
  });
  it("CNJ só é aceito com 20 dígitos e dígito verificador válido", () => {
    expect(cnjFromDigits(digits)).toBe(cnj);
    expect(cnjFromDigits("123")).toBeNull();
    expect(cnjFromDigits(null)).toBeNull();
    expect(cnjFromDigits(digits.slice(0, 7) + "99" + digits.slice(9))).toBeNull();
  });
  it("tipos preservam as diferenças jurídicas", () => {
    expect(kindFromSource("Sentença", null)).toBe("SENTENCA");
    expect(kindFromSource(null, "Citação")).toBe("CITACAO");
    expect(kindFromSource("Acórdão", null)).toBe("DECISAO");
    expect(kindFromSource("Edital", null)).toBe("OUTRO");
  });
  it("item do DJEN vira SEMPRE publicação do DJEN (nunca intimação privada) e leva o hash do bruto", () => {
    const it = parseDjenItem(djenItem({ id: 77, numero_processo: digits }))!;
    const n = normalizeDjenItem(it);
    expect(n).toMatchObject({ origin: "DJEN_PUBLICATION", sourceSystem: "djen", officialId: "77", cnj });
    expect(n.rawHash).toMatch(/^[0-9a-f]{64}$/);
    expect(n.title).toContain("(DJEN)");
  });
  it("item sem id ou sem texto não é inventado", () => {
    expect(parseDjenItem({ id: 1 })).toBeNull();
    expect(parseDjenItem({ texto: "x" })).toBeNull();
    expect(parseDjenItem(null)).toBeNull();
  });
});

describe("vinculação segura ao processo", () => {
  it("vincula só quando há um único processo", () => {
    expect(decideCaseMatch(cnj, [{ id: "c1", number: cnj }])).toEqual({ state: "LINKED", caseId: "c1" });
  });
  it("ambíguo: não vincula e pede confirmação manual", () => {
    expect(decideCaseMatch(cnj, [{ id: "c1", number: cnj }, { id: "c2", number: cnj }])).toEqual({ state: "AMBIGUOUS", caseId: null });
  });
  it("não encontrado: não cria processo duplicado", () => {
    expect(decideCaseMatch(cnj, [])).toEqual({ state: "NOT_FOUND", caseId: null });
    expect(decideCaseMatch(cnj, [{ id: "c9", number: "outro" }])).toEqual({ state: "NOT_FOUND", caseId: null });
  });
  it("sem CNJ: não tenta adivinhar", () => {
    expect(decideCaseMatch(null, [{ id: "c1", number: cnj }])).toEqual({ state: "NO_CNJ", caseId: null });
  });
});
