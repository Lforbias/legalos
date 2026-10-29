import { describe, expect, it } from "vitest";
import { NAV_ITEMS, spaceOfPath } from "@/config/navigation";

describe("espaços LegalOS Func, Box e Chat", () => {
  it("caminhos do Box pertencem ao Box, inclusive subpáginas", () => {
    for (const p of ["/box", "/caixa-de-entrada", "/caixa-de-entrada/abc", "/caixa-de-entrada/equipes", "/peticoes", "/peticoes/x", "/certificados"]) {
      expect(spaceOfPath(p)).toBe("box");
    }
  });
  it("o atendimento pertence ao Chat, inclusive as configurações", () => {
    for (const p of ["/atendimento", "/atendimento/configuracoes"]) expect(spaceOfPath(p)).toBe("chat");
    expect(spaceOfPath("/atendimentos-x")).toBe("func");
  });
  it("o resto é Func (e prefixos parecidos não enganam)", () => {
    for (const p of ["/", "/processos", "/processos/1", "/prazos", "/relatorios", "/boxe", "/caixa-de-entradaX", "/clientes", "/integracoes"]) {
      expect(spaceOfPath(p)).toBe("func");
    }
  });
  it("todo item de navegação pertence a um espaço e a visão geral de cada lado existe", () => {
    for (const n of NAV_ITEMS) expect(["func", "box", "chat", "both"]).toContain(n.space);
    expect(NAV_ITEMS.find((n) => n.key === "overview")?.space).toBe("func");
    expect(NAV_ITEMS.find((n) => n.key === "box-overview")?.href).toBe("/box");
    for (const k of ["whatsapp", "chat-settings"]) expect(NAV_ITEMS.find((n) => n.key === k)?.space).toBe("chat");
    for (const k of ["inbox", "petitions", "certificates"]) expect(NAV_ITEMS.find((n) => n.key === k)?.space).toBe("box");
  });
});
