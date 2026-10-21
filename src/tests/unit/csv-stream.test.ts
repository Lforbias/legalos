import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { iterCsv, parseCsv } from "@/lib/import/csv";

async function collect(file: string, chunk: number) {
  const out: Record<string, string>[] = [];
  for await (const r of iterCsv(file, chunk)) out.push(r);
  return out;
}

describe("iterCsv (leitura em fluxo) = parseCsv", () => {
  const text = '﻿"Código","Descrição","Obs"\r\n"1","linha 1\nlinha 2 com ""aspas""","a,b"\r\n\r\n"2","","x"\n"3","fim sem quebra","ç ã é"';
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "csv-")), "t.csv");
  fs.writeFileSync(file, text);

  it("dá o mesmo resultado, qualquer que seja o tamanho do bloco (inclui cortes no meio de aspas, CRLF e acentos)", async () => {
    const expected = parseCsv(text);
    expect(expected).toHaveLength(3);
    for (const size of [1, 2, 3, 5, 7, 16, 1024]) expect(await collect(file, size)).toEqual(expected);
  });

  it("arquivo só com cabeçalho ou vazio não gera linhas", async () => {
    const f2 = path.join(path.dirname(file), "h.csv");
    fs.writeFileSync(f2, '"A","B"\n');
    expect(await collect(f2, 4)).toEqual([]);
    const f3 = path.join(path.dirname(file), "e.csv");
    fs.writeFileSync(f3, "");
    expect(await collect(f3, 4)).toEqual([]);
  });
});
