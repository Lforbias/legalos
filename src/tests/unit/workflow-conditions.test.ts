import { describe, expect, it } from "vitest";
import { matchesConditions } from "@/modules/workflows/conditions";
const c = (field: string, value: string, operator = "CONTAINS") => ({ field, value, operator });
describe("condições de automação", () => {
  it("combina E/OU ignorando caixa e acentos", () => {
    const items = [c("label", "DECISAO"), c("court", "tjba", "EQUALS")];
    expect(matchesConditions({ mode: "ALL", items }, { label: "Decisão urgente", court: "TJBA" })).toBe(true);
    expect(matchesConditions({ mode: "ALL", items }, { label: "Decisão urgente", court: "TJSP" })).toBe(false);
    expect(matchesConditions({ mode: "ANY", items }, { label: "Despacho", court: "TJBA" })).toBe(true);
  });
  it("compara etiquetas individualmente e não aceita campo ausente para negação", () => {
    expect(matchesConditions({ mode: "ALL", items: [c("tag", "urgente", "EQUALS")] }, { tag: ["revisar", "URGENTE"] })).toBe(true);
    expect(matchesConditions({ mode: "ALL", items: [c("court", "tjba", "NOT_CONTAINS")] }, {})).toBe(false);
  });
  it("sem condições executa; configuração inválida é recusada", () => {
    expect(matchesConditions({ mode: "ANY", items: [] }, {})).toBe(true);
    expect(matchesConditions({ mode: "invalid", items: [] }, {})).toBe(false);
    expect(matchesConditions({ mode: "ALL", items: [c("sql", "x")] }, {})).toBe(false);
  });
});
