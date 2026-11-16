import { describe, expect, it } from "vitest";
import { describeSignature, hostAndPath, redactText, sanitizeSignature } from "@/lib/robots/pje/signature";

describe("diagnóstico sanitizado de telas do robô", () => {
  it("hostAndPath descarta query e fragmento (tokens, hashes, números de processo)", () => {
    expect(hostAndPath("https://eproc1g.tjmg.jus.br/eproc/controlador.php?acao=principal&hash=abc123#x")).toEqual({ host: "eproc1g.tjmg.jus.br", path: "/eproc/controlador.php" });
    expect(hostAndPath("https://pje.exemplo.jus.br/app;jsessionid=SEGREDO/painel?x=1").path).toBe("/app/painel");
    expect(hostAndPath("não é url")).toEqual({ host: "", path: "" });
  });

  it("redactText também remove e-mails, além de números longos e do nome da pessoa", () => {
    const out = redactText("Contato talita.silva@escritorio.adv.br, CPF 123.456.789-00, processo 0001234-56.2024.8.13.0024", ["Talita"]);
    expect(out).not.toMatch(/@escritorio|\d{3,}|Talita/i);
  });

  it("sanitizeSignature limpa também os quadros internos e limita abas", () => {
    const sig = sanitizeSignature({
      host: "eproc1g.tjmg.jus.br",
      path: "/eproc/externo_controlador.php",
      title: "Painel de Talita 12345",
      headings: [],
      fields: ["input:text:txtCodigo"],
      buttons: [],
      frames: [{ host: "eproc1g.tjmg.jus.br", path: "/eproc/x;jsessionid=ABC", title: "Olá Talita", fields: ["input:text:cpf12345"], buttons: ["Validar 999"] }],
      pages: 99,
    }, ["Talita"]);
    expect(JSON.stringify(sig)).not.toMatch(/Talita|12345|ABC|999/);
    expect(sig.frames).toHaveLength(1);
    expect(sig.pages).toBe(20);
  });

  it("describeSignature lista só estrutura e cabe no terminal (linhas curtas, no máximo 8)", () => {
    const lines = describeSignature({
      host: "eproc1g.tjmg.jus.br",
      path: "/eproc/externo_controlador.php",
      title: "Autenticação",
      headings: ["Texto que não deve aparecer"],
      fields: Array.from({ length: 20 }, (_, i) => `input:text:campo_${i}_com_nome_bem_comprido_para_estourar_a_linha`),
      buttons: ["Validar"],
      frames: [{ host: "eproc1g.tjmg.jus.br", path: "/eproc/token", title: "", fields: ["input:text:txtCodigo"], buttons: ["Confirmar"] }],
      pages: 2,
    });
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines.every((line) => line.length <= 224)).toBe(true);
    const text = lines.join("\n");
    expect(text).toContain("eproc1g.tjmg.jus.br/eproc/externo_controlador.php");
    expect(text).toContain("Quadro interno");
    expect(text).toContain("Abas abertas");
    expect(text).not.toContain("Texto que não deve aparecer");
  });

  it("describeSignature sem leitura possível avisa em vez de falhar", () => {
    expect(describeSignature(null)[0]).toContain("não foi possível");
  });
});
