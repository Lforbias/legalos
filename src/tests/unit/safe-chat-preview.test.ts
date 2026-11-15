import { describe, expect, it } from "vitest";
import { safeChatPreview } from "@/lib/whatsapp/safe-preview";
describe("prévia de conversa", () => {
  it("oculta links de inscrição de autenticação e mantém o contexto", () => {
    expect(safeChatPreview("Recebi otpauth://totp/Test?secret=EXAMPLE fim")).toBe("Recebi [Dados de autenticação ocultos] fim");
    expect(safeChatPreview("OTPAUTH-MIGRATION://offline?data=EXAMPLE")).toBe("[Dados de autenticação ocultos]");
    expect(safeChatPreview("otpauth://" )).toBe("[Dados de autenticação ocultos]");
  });
  it("preserva mensagens comuns e ausência de prévia", () => {
    expect(safeChatPreview("Documento recebido https://example.test/doc")).toBe("Documento recebido https://example.test/doc");
    expect(safeChatPreview(null)).toBeNull();
  });
});
