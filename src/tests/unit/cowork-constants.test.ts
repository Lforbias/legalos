import { describe, expect, it } from "vitest";
import { avatarColor, initials, isCoworkDepartment, RESOURCE_KIND_LABEL, RESOURCE_KINDS, WORK_PURPOSE_LABEL, WORK_PURPOSES } from "@/modules/cowork/constants";
import { directKeyOf } from "@/server/cowork/core";

describe("Cowork — utilitários", () => {
  it("iniciais e cor de avatar estáveis (sem foto inventada)", () => {
    expect(initials("Ana Maria Souza")).toBe("AS");
    expect(initials("caio")).toBe("C");
    expect(initials("  ")).toBe("?");
    expect(avatarColor("x")).toBe(avatarColor("x"));
  });
  it("chave de conversa direta não depende da ordem", () => {
    expect(directKeyOf("b", "a")).toBe(directKeyOf("a", "b"));
  });
  it("todos os tipos têm rótulo em português", () => {
    for (const k of RESOURCE_KINDS) expect(RESOURCE_KIND_LABEL[k]).toBeTruthy();
    for (const k of WORK_PURPOSES) expect(WORK_PURPOSE_LABEL[k]).toBeTruthy();
  });
  it("departamentos válidos", () => {
    expect(isCoworkDepartment("juridico")).toBe(true);
    expect(isCoworkDepartment("lobby")).toBe(false);
    expect(isCoworkDepartment(null)).toBe(false);
  });
});
