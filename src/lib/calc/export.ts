import JSZip from "jszip";
import type { CalcResult } from "./num";

const csvCell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV com ponto e vírgula e BOM (abre direto no Excel em português). */
export function toCsv(r: CalcResult): string {
  const out: string[] = [csvCell(r.title), ""];
  for (const s of r.sections) {
    out.push(csvCell(s.title), s.columns.map(csvCell).join(";"), ...s.rows.map((x) => x.map(csvCell).join(";")), "");
  }
  out.push("RESUMO", ...r.summary.map(([k, v]) => `${csvCell(k)};${csvCell(v)}`));
  if (r.warnings.length) out.push("", "AVISOS", ...r.warnings.map(csvCell));
  return "﻿" + out.join("\r\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colName = (n: number) => String.fromCharCode(65 + n);

/** Planilha .xlsx mínima no padrão do escritório (cabeçalho bordô, linhas alternadas, total em destaque). */
export async function toXlsx(r: CalcResult): Promise<Buffer> {
  const rows: { cells: string[]; style: number }[] = [{ cells: [r.title], style: 4 }, { cells: [], style: 0 }];
  for (const s of r.sections) {
    rows.push({ cells: [s.title], style: 4 }, { cells: s.columns, style: 1 });
    s.rows.forEach((x, i) => rows.push({ cells: x, style: i % 2 ? 2 : 0 }));
    rows.push({ cells: [], style: 0 });
  }
  rows.push({ cells: ["RESUMO"], style: 4 });
  r.summary.forEach(([k, v]) => rows.push({ cells: [k, v], style: /^TOTAL|VENCIMENTO/.test(k) ? 3 : 0 }));
  if (r.warnings.length) { rows.push({ cells: [], style: 0 }, { cells: ["AVISOS"], style: 4 }); r.warnings.forEach((w) => rows.push({ cells: [w], style: 0 })); }
  const maxCols = Math.max(...rows.map((x) => x.cells.length), 1);
  const sheetRows = rows.map((row, ri) => `<row r="${ri + 1}">${row.cells.map((c, ci) => `<c r="${colName(ci)}${ri + 1}" t="inlineStr" s="${row.style}"><is><t xml:space="preserve">${esc(c)}</t></is></c>`).join("")}</row>`).join("");
  const cols = `<cols>${Array.from({ length: maxCols }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 34 : 18}" customWidth="1"/>`).join("")}</cols>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF630F16"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFAF3EE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4A0B11"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf fontId="0" fillId="3" applyFill="1"/><xf fontId="2" fillId="4" applyFont="1" applyFill="1"/><xf fontId="0" fillId="0"><alignment/></xf></cellXfs></styleSheet>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cálculo" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", styles);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
