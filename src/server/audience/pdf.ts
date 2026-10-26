import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CalcResult } from "@/lib/calc/num";
/** Paginated plain text memory, with wrap measured in points and explicit limitations. */
export async function resultPdf(r: CalcResult) {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage(),
    y = 790;
  const clean = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff\n]/g, "-");
  const line = (value: string) => {
    const words = clean(value).split(/\s+/);
    let row = "";
    const draw = () => {
      if (y < 50) {
        page = doc.addPage();
        y = 790;
      }
      page.drawText(row, {
        x: 42,
        y,
        font,
        size: 10,
        color: rgb(0.09, 0.12, 0.2),
      });
      y -= 16;
    };
    for (const w of words) {
      if (font.widthOfTextAtSize(row + " " + w, 10) > 505) {
        draw();
        row = w;
      } else row += (row ? " " : "") + w;
    }
    draw();
  };
  line("LegalOS Tools - Memória de cálculo auxiliar");
  line(r.title);
  line("Gerado em " + new Date().toISOString());
  y -= 14;
  for (const [k, v] of r.summary) line(k + ": " + v);
  for (const section of r.sections) {
    y -= 14;
    line(section.title);
    line(section.columns.join(" | "));
    for (const row of section.rows) line(row.join(" | "));
  }
  y -= 14;
  line("CRITÉRIOS E LIMITAÇÕES");
  for (const text of [...r.criteria, ...r.warnings]) line(text);
  doc.setTitle(r.title);
  return doc.save();
}
