import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

/**
 * Converte o texto mesclado em .docx editável. Convenções: linha iniciada por "# " = título centralizado em negrito;
 * linha em branco separa parágrafos; quebras simples dentro do parágrafo são preservadas.
 */
export async function textToDocx(text: string, title: string): Promise<Buffer> {
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
  const doc = new Document({ title, creator: "LegalOS", sections: [{ children: paragraphs }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
