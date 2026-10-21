import fs from "node:fs";

/**
 * Leitor de CSV (RFC 4180): campos entre aspas, aspas duplicadas ("") e quebras de linha dentro de campos.
 * Remove BOM. Retorna objetos indexados pelo cabeçalho. Não interpreta tipos.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  const header = rows.shift();
  if (!header) return [];
  return rows.map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, idx) => {
      o[h.trim()] = (r[idx] ?? "").trim();
    });
    return o;
  });
}

/**
 * Leitor de CSV em fluxo (mesma sintaxe de parseCsv), para arquivos grandes (ex.: Históricos do Astrea, ~100 MB):
 * lê em blocos e devolve uma linha por vez, sem manter o arquivo inteiro na memória.
 */
export async function* iterCsv(file: string, chunkSize = 1 << 20): AsyncGenerator<Record<string, string>> {
  const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: chunkSize });
  let header: string[] | null = null;
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteSeen = false; // dentro de aspas, acabou de ver uma aspa (fecha o campo ou é aspa escapada)
  let skipLf = false;
  let first = true;

  const toObject = (r: string[]): Record<string, string> | null => {
    if (!header) {
      header = r;
      return null;
    }
    const o: Record<string, string> = {};
    header.forEach((h, idx) => {
      o[h.trim()] = (r[idx] ?? "").trim();
    });
    return o;
  };

  for await (const chunk of stream as AsyncIterable<string>) {
    let s = chunk;
    if (first) {
      first = false;
      if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    }
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!;
      if (skipLf) {
        skipLf = false;
        if (ch === "\n") continue;
      }
      if (quoted) {
        if (quoteSeen) {
          quoteSeen = false;
          if (ch === '"') {
            field += '"';
            continue;
          }
          quoted = false; // a aspa anterior fechou o campo; trata este caractere como fora de aspas
        } else if (ch === '"') {
          quoteSeen = true;
          continue;
        } else {
          field += ch;
          continue;
        }
      }
      if (ch === '"') quoted = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r") skipLf = true;
        row.push(field);
        field = "";
        const done = row.length > 1 || row[0] !== "" ? row : null;
        row = [];
        if (done) {
          const o = toObject(done);
          if (o) yield o;
        }
      } else field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") {
      const o = toObject(row);
      if (o) yield o;
    }
  }
}
