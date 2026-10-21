export type CsvCell = string | number | null | undefined;

/** Texto que o Excel/Calc executaria como fórmula (injeção de CSV) ganha um apóstrofo na frente. */
function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return '""';
  const text = typeof v === "number" ? (Number.isFinite(v) ? String(v).replace(".", ",") : "") : safeText(v);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

/** CSV para Excel em português: separador `;`, vírgula decimal, UTF-8 com BOM. Números entram como número (negativos válidos); texto é neutralizado. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map((h) => cell(h)).join(";"), ...rows.map((r) => r.map(cell).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
