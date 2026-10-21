import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { textToDocx } from "@/lib/templates/docx";
import { imageSize, sniffImage, type LetterheadData } from "@/lib/templates/letterhead";
import { renderPreviewPdf } from "@/lib/templates/pdf";

// PNG 2x1 válido
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP8z8Dwn4EBAAkEAQDrUbkRAAAAAElFTkSuQmCC", "base64"));
const LH: LetterheadData = { headerText: "TSB Advocacia\nOAB/BA 00000", footerText: "(71) 0000-0000\ncontato@exemplo.test", logo: PNG, logoMime: "image/png", showPageNumbers: true };

describe("timbrado: imagens", () => {
  it("reconhece PNG e JPEG pelos bytes e recusa o resto", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImage(Uint8Array.from(Buffer.from("<svg></svg>")))).toBeNull();
    expect(imageSize(PNG)).toEqual({ width: 2, height: 1 });
  });
});

describe("prévia em PDF", () => {
  it("gera PDF válido com timbrado e quebra em várias páginas", async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Parágrafo ${i + 1}: ação, coração, “aspas” e travessão — com texto bem longo para forçar a quebra de linha e de página no documento gerado.`).join("\n\n");
    const bytes = await renderPreviewPdf(`# TÍTULO DA PEÇA\n\n${long}`, "Teste", LH);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
  it("funciona sem timbrado, com texto vazio e com caracteres fora da fonte", async () => {
    const a = await PDFDocument.load(await renderPreviewPdf("Texto simples", "Sem timbrado", null));
    expect(a.getPageCount()).toBe(1);
    const b = await PDFDocument.load(await renderPreviewPdf("", "Vazio", LH));
    expect(b.getPageCount()).toBe(1);
    const c = await PDFDocument.load(await renderPreviewPdf("Símbolos fora da fonte: ≥ ∑ 日本語 ✓", "Símbolos", null));
    expect(c.getPageCount()).toBe(1);
  });
});

describe(".docx com timbrado", () => {
  it("inclui cabeçalho, rodapé, numeração e o logo", async () => {
    const zip = await JSZip.loadAsync(await textToDocx("# Título\n\nCorpo do texto.", "Teste", LH));
    const names = Object.keys(zip.files);
    const header = await zip.file(names.find((n) => /word\/header\d*\.xml$/.test(n))!)!.async("string");
    const footer = await zip.file(names.find((n) => /word\/footer\d*\.xml$/.test(n))!)!.async("string");
    expect(header).toContain("TSB Advocacia");
    expect(header).toContain("<w:drawing>");
    expect(footer).toContain("contato@exemplo.test");
    expect(footer).toMatch(/PAGE/);
    expect(names.some((n) => n.startsWith("word/media/"))).toBe(true);
  });
  it("sem timbrado não cria cabeçalho nem rodapé", async () => {
    const zip = await JSZip.loadAsync(await textToDocx("Corpo.", "Teste"));
    expect(Object.keys(zip.files).some((n) => /word\/(header|footer)/.test(n))).toBe(false);
  });
});
