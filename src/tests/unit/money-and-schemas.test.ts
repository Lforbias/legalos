import { describe, expect, it } from "vitest";
import { formatMoneyBR, parseMoneyBR } from "@/lib/validation/money";
import { clientSchema, parseTags, toClientData, type ClientInput } from "@/modules/clients/schemas";
import { caseSchema, toCaseData, type CaseInput } from "@/modules/cases/schemas";
import { computeCnjCheck } from "@/lib/validation/br-documents";

describe("dinheiro BRL", () => {
  it("interpreta formatos comuns sem usar ponto flutuante", () => {
    expect(parseMoneyBR("1.234,56")).toBe("1234.56");
    expect(parseMoneyBR("R$ 10,5")).toBe("10.50");
    expect(parseMoneyBR("1234")).toBe("1234.00");
    expect(parseMoneyBR("1234.5")).toBe("1234.50");
    expect(parseMoneyBR("0,99")).toBe("0.99");
  });
  it("rejeita formatos inválidos e valores além de numeric(14,2)", () => {
    for (const bad of ["abc", "1,2,3", "-5", "1.23.4", "9999999999999,00"]) expect(parseMoneyBR(bad)).toBeNull();
  });
  it("formata", () => expect(formatMoneyBR("1234567.8")).toBe("R$ 1.234.567,80"));
});

const baseClient: ClientInput = {
  type: "PERSON", status: "ACTIVE", name: "Maria da Silva", tradeName: "", document: "", email: "", phone: "", birthDate: "",
  tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "",
};

describe("clientSchema", () => {
  it("aceita cadastro mínimo e normaliza para persistência", () => {
    const parsed = clientSchema.parse({ ...baseClient, document: "529.982.247-25", email: "MARIA@Example.com", phone: "(11) 91234-5678", tags: "VIP, vip ; Trabalhista", addressState: "sp" });
    const data = toClientData(parsed);
    expect(data.document).toBe("52998224725");
    expect(data.email).toBe("maria@example.com");
    expect(data.phone).toBe("11912345678");
    expect(data.tags).toEqual(["VIP", "Trabalhista"]);
    expect(data.addressState).toBe("SP");
  });
  it("valida CPF/CNPJ conforme o tipo e regras de nascimento", () => {
    expect(clientSchema.safeParse({ ...baseClient, document: "111.111.111-11" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...baseClient, type: "COMPANY", document: "529.982.247-25" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...baseClient, type: "COMPANY", document: "11.222.333/0001-81" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...baseClient, type: "COMPANY", birthDate: "1990-01-01" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...baseClient, birthDate: "2999-01-01" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...baseClient, email: "x" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...baseClient, phone: "123" }).success).toBe(false);
  });
  it("limita etiquetas", () => {
    expect(parseTags(Array.from({ length: 15 }, (_, i) => `t${i}`).join(","))).toHaveLength(10);
  });
});

describe("caseSchema", () => {
  const check = computeCnjCheck({ sequence: "0001234", year: "2023", segment: "8", court: "26", origin: "0100" });
  const valid = `0001234-${check}.2023.8.26.0100`;
  const base: CaseInput = {
    number: "", legacyNumber: "", title: "Ação de cobrança", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "",
    status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "",
  };
  it("aceita número CNJ válido e rejeita dígito errado", () => {
    expect(caseSchema.safeParse({ ...base, number: valid }).success).toBe(true);
    expect(caseSchema.safeParse({ ...base, number: valid.replace(`-${check}.`, "-00.") }).success).toBe(false);
  });
  it("permite processo sem número (consultivo/extrajudicial) e normaliza valor", () => {
    const data = toCaseData(caseSchema.parse({ ...base, claimValue: "10.500,00", courtState: "rj" }));
    expect(data.number).toBeNull();
    expect(data.claimValue).toBe("10500.00");
    expect(data.courtState).toBe("RJ");
  });
});
