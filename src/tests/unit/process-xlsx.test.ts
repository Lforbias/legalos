import JSZip from "jszip";
import { expect, it } from "vitest";
import { readProcessXlsx } from "@/lib/import/process-xlsx";
import { toXlsx } from "@/lib/reports/xlsx";

it("preserva zeros à esquerda e identifica colunas com cabeçalhos iguais", async () => {
  const bytes = await toXlsx("Processos", ["CNJ", "CNJ"], [["0000001-12.2024.8.26.0001", "00000011220248260001"]]);
  await expect(readProcessXlsx(bytes)).resolves.toEqual([{
    "CNJ (A)": "0000001-12.2024.8.26.0001",
    "CNJ (B)": "00000011220248260001",
  }]);
});

it("lê strings compartilhadas na primeira aba visível e rejeita valores numéricos e fórmulas", async () => {
  const zip = await JSZip.loadAsync(await toXlsx("Original", ["CNJ"], []));
  zip.file("xl/workbook.xml", `<workbook><sheets><sheet name="Oculta" state="hidden" r:id="rId1"/><sheet name="Dados" r:id="rId3"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/dados.xml"/></Relationships>`);
  zip.file("xl/sharedStrings.xml", `<sst><si><t>Processo</t></si><si><r><t>0000001-12.</t></r><r><t>2024.8.26.0001</t></r></si></sst>`);
  zip.file("xl/worksheets/dados.xml", `<worksheet><sheetData>
    <row><c r="C1" t="s"><v>0</v></c></row>
    <row><c r="C2" t="s"><v>1</v></c></row>
    <row><c r="C3"><v>10000000000000000000</v></c></row>
    <row><c r="C4" t="str"><f>CONCAT(A4,B4)</f><v>0000001-12.2024.8.26.0001</v></c></row>
  </sheetData></worksheet>`);
  await expect(readProcessXlsx(await zip.generateAsync({ type: "nodebuffer" }))).resolves.toEqual([
    { "Processo (C)": "0000001-12.2024.8.26.0001" },
    { "Processo (C)": "[valor-não-textual]" },
    { "Processo (C)": "[fórmula-no-Excel]" },
  ]);
});
