import path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { ValidationError } from "@/lib/permissions/check";

type TextPart = string | { "#text"?: string };
type RichText = { t?: TextPart; r?: { t?: TextPart } | { t?: TextPart }[] };
type Cell = { "@_r"?: string; "@_t"?: string; v?: string; is?: RichText; f?: unknown };

const list = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (part?: TextPart) => typeof part === "string" ? part : part?.["#text"] ?? "";
const richText = (part?: RichText) => text(part?.t) || list(part?.r).map((run) => text(run.t)).join("");
const invalid = () => new ValidationError("Use um arquivo .xlsx com uma aba de dados e cabeçalho na primeira linha.");
const maxXmlBytes = 8 * 1024 * 1024;

export async function readProcessXlsx(bytes: Buffer): Promise<Record<string, string>[]> {
  const zip = await JSZip.loadAsync(bytes).catch(() => { throw invalid(); });
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false });

  async function readXml<T>(name: string): Promise<T> {
    const entry = zip.file(name);
    if (!entry) throw invalid();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      await pipeline(entry.nodeStream(), new Writable({
        write(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (size > maxXmlBytes) {
            callback(new ValidationError("A planilha descompactada é grande demais. Divida o arquivo em lotes menores."));
            return;
          }
          chunks.push(chunk);
          callback();
        },
      }));
      const xml = Buffer.concat(chunks).toString("utf8");
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalid();
      return parser.parse(xml) as T;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw invalid();
    }
  }

  type Sheet = { "@_r:id": string; "@_state"?: string };
  type Relationship = { "@_Id": string; "@_Target": string; "@_TargetMode"?: string; "@_Type"?: string };
  const [workbook, relationships] = await Promise.all([
    readXml<{ workbook?: { sheets?: { sheet?: Sheet | Sheet[] } } }>("xl/workbook.xml"),
    readXml<{ Relationships?: { Relationship?: Relationship | Relationship[] } }>("xl/_rels/workbook.xml.rels"),
  ]);
  const first = list(workbook.workbook?.sheets?.sheet).find((sheet) => !sheet["@_state"] || sheet["@_state"] === "visible");
  const links = list(relationships.Relationships?.Relationship);
  const link = links.find((item) => item["@_Id"] === first?.["@_r:id"] && item["@_Type"]?.endsWith("/worksheet"));
  if (!link || link["@_TargetMode"] === "External" || !link["@_Target"]) throw invalid();
  const target = link["@_Target"];
  const worksheetPath = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.join("xl", target);
  if (!worksheetPath.startsWith("xl/worksheets/")) throw invalid();

  type Row = { c?: Cell | Cell[] };
  const worksheet = await readXml<{ worksheet?: { sheetData?: { row?: Row | Row[] } } }>(worksheetPath);
  const strings = zip.file("xl/sharedStrings.xml")
    ? list((await readXml<{ sst?: { si?: RichText | RichText[] } }>("xl/sharedStrings.xml")).sst?.si).map(richText)
    : [];

  const rows = list(worksheet.worksheet?.sheetData?.row);
  const columns = (row?: Row) => list(row?.c).map((cell) => {
    const column = /^[A-Z]{1,3}(?=[0-9]+$)/.exec(cell["@_r"] ?? "")?.[0];
    let value = cell.f === undefined ? "" : "[fórmula-no-Excel]";
    if (cell.f === undefined) {
      if (cell["@_t"] === "s" && /^\d+$/.test(cell.v ?? "")) value = strings[Number(cell.v)] ?? "";
      else if (cell["@_t"] === "inlineStr") value = richText(cell.is);
      else if (cell["@_t"] === "str") value = cell.v ?? "";
      // Um CNJ armazenado como número no Excel pode já ter perdido dígitos.
      else if (cell.v) value = "[valor-não-textual]";
    }
    return { column, value: value.trim() };
  });

  const headers = new Map(columns(rows[0]).filter(({ column, value }) => column && value && value !== "[valor-não-textual]" && value !== "[fórmula-no-Excel]")
    .map(({ column, value }) => [column!, `${value} (${column})`]));
  return rows.slice(1).map((row) => Object.fromEntries(columns(row).flatMap(({ column, value }) => {
    const name = column ? headers.get(column) : undefined;
    return name ? [[name, value]] : [];
  })));
}
