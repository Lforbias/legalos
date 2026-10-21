import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/reports/csv";

describe("CSV de relatórios", () => {
  it("usa BOM, separador ; e CRLF; números com vírgula decimal e negativos intactos", () => {
    const out = toCsv(["A", "B"], [["x", -12.5], ["y", 3]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('"A";"B"\r\n');
    expect(out).toContain('"x";"-12,5"');
    expect(out).toContain('"y";"3"');
  });
  it("neutraliza texto que viraria fórmula no Excel e escapa aspas e quebras de linha", () => {
    const out = toCsv(["T"], [["=1+1"], ["+cmd"], ["-x"], ["@SOMA(A1)"], ['diz "oi"\nlinha'], [null], [Number.NaN]]);
    expect(out).toContain(`"'=1+1"`);
    expect(out).toContain(`"'+cmd"`);
    expect(out).toContain(`"'-x"`);
    expect(out).toContain(`"'@SOMA(A1)"`);
    expect(out).toContain('"diz ""oi"" linha"');
    expect(out.split("\r\n").filter(Boolean)).toHaveLength(8);
  });
});
