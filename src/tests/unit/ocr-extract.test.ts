import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { maskSensitive } from "@/lib/ai/mask";
import { extractText, normalizeForSearch } from "@/lib/ocr/extract";

describe("extração de texto", () => {
  it("normaliza para busca sem acento e preserva as posições", () => {
    expect(normalizeForSearch("Audiência de Conciliação")).toBe("audiencia de conciliacao");
    const s = "Ação de Cobrança — órgão";
    expect(normalizeForSearch(s)).toHaveLength(s.normalize("NFC").length);
  });

  it("lê TXT, DOCX e ODT; recusa formatos sem extrator e arquivos corrompidos", async () => {
    expect(await extractText(Buffer.from("Olá  mundo\r\n\r\n\r\n\r\nfim"), "txt")).toMatchObject({ status: "EXTRACTED", text: "Olá  mundo\n\nfim" });
    expect(await extractText(Buffer.from("   \n"), "txt")).toMatchObject({ status: "EMPTY" });
    const z = new JSZip();
    z.file("word/document.xml", "<w:p><w:r><w:t>Um &amp; dois</w:t></w:r></w:p><w:p><w:r><w:t>três</w:t></w:r></w:p>");
    expect((await extractText(await z.generateAsync({ type: "nodebuffer" }), "docx")).text).toBe("Um & dois\ntrês");
    const o = new JSZip();
    o.file("content.xml", "<text:p>linha um</text:p><text:p>linha dois</text:p>");
    expect((await extractText(await o.generateAsync({ type: "nodebuffer" }), "odt")).text).toBe("linha um\nlinha dois");
    expect(await extractText(Buffer.from("x"), "xlsx")).toMatchObject({ status: "UNAVAILABLE" });
    expect(await extractText(Buffer.from("não é zip"), "docx")).toMatchObject({ status: "FAILED" });
  });

  it("PDF com camada de texto é lido sem OCR", async () => {
    const r = await extractText(fs.readFileSync(path.join(process.cwd(), "src/tests/fixtures/text.pdf")), "pdf");
    expect(r).toMatchObject({ status: "EXTRACTED", method: "pdf-text", pages: 1 });
    expect(r.text).toContain("attorney fees");
  });

  it("oculta CPF, CNPJ e e-mail antes de enviar à IA", () => {
    expect(maskSensitive("CPF 529.982.247-25 e 52998224725; CNPJ 11.222.333/0001-81; a@b.com.br")).toBe("CPF [CPF] e [CPF]; CNPJ [CNPJ]; [E-MAIL]");
    expect(maskSensitive("Processo 5015905-44.2022.4.03.6183")).toBe("Processo 5015905-44.2022.4.03.6183");
  });
});
