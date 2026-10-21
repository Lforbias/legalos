import { AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { imageSize, type LetterheadData } from "./letterhead";

/**
 * Converte o texto mesclado em .docx editável. Convenções: linha iniciada por "# " = título centralizado em negrito;
 * linha em branco separa parágrafos; quebras simples dentro do parágrafo são preservadas.
 * Com `letterhead`, aplica logo e cabeçalho no topo e rodapé (com numeração opcional) em todas as páginas.
 */
export async function textToDocx(text: string, title: string, letterhead?: LetterheadData | null): Promise<Buffer> {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const paragraphs: Paragraph[] = [];
  const font = "Times New Roman";
  for (const block of blocks) {
    const trimmed = block.replace(/^\n+|\n+$/g, "");
    if (!trimmed) continue;
    if (trimmed.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: trimmed.slice(2).trim(), bold: true, font, size: 28 })],
        }),
      );
      continue;
    }
    const lines = trimmed.split("\n");
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 360 },
        children: lines.map((l, i) => new TextRun({ text: l, font, size: 24, break: i > 0 ? 1 : undefined })),
      }),
    );
  }
  if (paragraphs.length === 0) paragraphs.push(new Paragraph({ children: [new TextRun({ text: "", font })] }));

  let headers: { default: Header } | undefined;
  let footers: { default: Footer } | undefined;
  if (letterhead) {
    const head: Paragraph[] = [];
    if (letterhead.logo && letterhead.logoMime) {
      const size = imageSize(letterhead.logo) ?? { width: 4, height: 1 };
      const h = 60; // px de altura no cabeçalho
      head.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ type: letterhead.logoMime === "image/png" ? "png" : "jpg", data: letterhead.logo, transformation: { width: Math.round((h * size.width) / size.height), height: h } })],
        }),
      );
    }
    for (const line of (letterhead.headerText ?? "").split("\n").filter((l) => l.trim())) {
      head.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: line.trim(), font, size: 20 })] }));
    }
    if (head.length) headers = { default: new Header({ children: head }) };
    const foot: Paragraph[] = [];
    for (const line of (letterhead.footerText ?? "").split("\n").filter((l) => l.trim())) {
      foot.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: line.trim(), font, size: 18 })] }));
    }
    if (letterhead.showPageNumbers) {
      foot.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], font, size: 18 })] }));
    }
    if (foot.length) footers = { default: new Footer({ children: foot }) };
  }
  const doc = new Document({ title, creator: "LegalOS", sections: [{ headers, footers, children: paragraphs }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
