import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { imageSize, type LetterheadData } from "./letterhead";

/**
 * Prévia em PDF do texto mesclado (A4, Times). É uma PRÉVIA fiel ao texto e ao timbrado, não o arquivo final:
 * o documento oficial continua sendo o .docx editável. Função sem I/O (testável).
 */
const A4 = { w: 595.28, h: 841.89 };
const M = { left: 70, right: 70, top: 56, bottom: 56 };

/** Troca caracteres que a fonte padrão do PDF não desenha por equivalentes seguros. */
function safe(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  const map: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "−": "-", " ": " ", "\t": "    " };
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const c = map[ch] ?? ch;
    out += set.has(c.codePointAt(0)!) ? c : "?";
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderPreviewPdf(text: string, title: string, letterhead?: LetterheadData | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title.slice(0, 120));
  pdf.setCreator("LegalOS (prévia)");
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  let logo: PDFImage | null = null;
  if (letterhead?.logo && letterhead.logoMime) logo = letterhead.logoMime === "image/png" ? await pdf.embedPng(letterhead.logo) : await pdf.embedJpg(letterhead.logo);

  const contentW = A4.w - M.left - M.right;
  const headLines = (letterhead?.headerText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const footLines = (letterhead?.footerText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const logoH = logo ? 46 : 0;
  const headerH = logoH + headLines.length * 12 + (logo || headLines.length ? 14 : 0);
  const footerH = footLines.length * 11 + (letterhead?.showPageNumbers ? 14 : 0) + (footLines.length || letterhead?.showPageNumbers ? 10 : 0);
  const top = A4.h - M.top - headerH;
  const bottom = M.bottom + footerH;

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    pages.push(page);
    y = top;
  };
  newPage();

  const ensure = (h: number) => {
    if (y - h < bottom) newPage();
  };
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.replace(/^\n+|\n+$/g, "")).filter(Boolean);
  for (const block of blocks) {
    if (block.startsWith("# ")) {
      const lines = wrap(bold, safe(bold, block.slice(2).trim()), 14, contentW);
      ensure(lines.length * 20 + 12);
      for (const l of lines) {
        page.drawText(l, { x: M.left + (contentW - bold.widthOfTextAtSize(l, 14)) / 2, y: y - 14, size: 14, font: bold });
        y -= 20;
      }
      y -= 12;
      continue;
    }
    const lines = wrap(font, safe(font, block), 12, contentW);
    for (const l of lines) {
      ensure(18);
      page.drawText(l, { x: M.left, y: y - 12, size: 12, font });
      y -= 18;
    }
    y -= 10;
  }

  const total = pages.length;
  pages.forEach((p, idx) => {
    let hy = A4.h - M.top;
    if (logo && letterhead?.logo) {
      const size = imageSize(letterhead.logo) ?? { width: logo.width, height: logo.height };
      const w = (logoH * size.width) / size.height;
      p.drawImage(logo, { x: (A4.w - w) / 2, y: hy - logoH, width: w, height: logoH });
      hy -= logoH + 4;
    }
    for (const l of headLines) {
      const t = safe(font, l);
      p.drawText(t, { x: (A4.w - font.widthOfTextAtSize(t, 10)) / 2, y: hy - 10, size: 10, font });
      hy -= 12;
    }
    if (logo || headLines.length) p.drawLine({ start: { x: M.left, y: hy - 4 }, end: { x: A4.w - M.right, y: hy - 4 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    let fy = M.bottom + (letterhead?.showPageNumbers ? 14 : 0) + footLines.length * 11;
    if (footLines.length || letterhead?.showPageNumbers) p.drawLine({ start: { x: M.left, y: fy + 4 }, end: { x: A4.w - M.right, y: fy + 4 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    for (const l of footLines) {
      const t = safe(font, l);
      fy -= 11;
      p.drawText(t, { x: (A4.w - font.widthOfTextAtSize(t, 9)) / 2, y: fy + 2, size: 9, font });
    }
    if (letterhead?.showPageNumbers) {
      const t = `Página ${idx + 1} de ${total}`;
      p.drawText(t, { x: (A4.w - font.widthOfTextAtSize(t, 9)) / 2, y: M.bottom, size: 9, font });
    }
    p.drawText("PRÉVIA - não é o documento final", { x: A4.w - M.right - 150, y: A4.h - 26, size: 7, font, color: rgb(0.55, 0.55, 0.55) });
  });
  return pdf.save();
}
