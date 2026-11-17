import { createHash } from "node:crypto";
import { toCents, fromCents } from "@/lib/finance/money";
import { parseCsv } from "@/lib/import/csv";
import { parseMoneyBR } from "@/lib/validation/money";

export type StatementMapping = { date: string; description: string; amount: string; reference?: string; direction?: string };
export type ParsedStatementLine = { fingerprint: string; postedOn: string; description: string; amount: string; direction: "RECEIVABLE" | "PAYABLE" };
export type StatementParseResult = { headers: string[]; sample: Record<string, string>[]; lines: ParsedStatementLine[]; invalidCount: number; duplicateCount: number };

function delimiterOf(text: string): string {
  const firstLine = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/, 1)[0] ?? "";
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const char = firstLine[i]!;
    if (char === '"') {
      if (quoted && firstLine[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && char === ",") commas++;
    else if (!quoted && char === ";") semicolons++;
  }
  return semicolons > commas ? ";" : ",";
}

function parseDate(raw: string): string | null {
  const value = raw.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d)
      ? `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}` : null;
  }
  match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d)
    ? `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}` : null;
}

function parseAmount(raw: string): { amount: string; negative: boolean } | null {
  let value = raw.trim().replace(/^R\$\s*/i, "").replace(/[\s\u00a0]/g, "");
  const parentheses = value.startsWith("(") && value.endsWith(")");
  const negative = parentheses || value.startsWith("-");
  value = value.replace(/^[+-]/, "").replace(/^\((.*)\)$/, "$1");
  const parsed = parseMoneyBR(value);
  const cents = parsed ? toCents(parsed) : null;
  if (cents === null || cents === 0n) return null;
  return { amount: fromCents(cents), negative };
}

function directionOf(raw: string | undefined, negative: boolean): "RECEIVABLE" | "PAYABLE" | null {
  if (!raw?.trim()) return negative ? "PAYABLE" : "RECEIVABLE";
  const value = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (["c", "credito", "credit", "entrada", "in", "recebimento", "receita"].includes(value)) return "RECEIVABLE";
  if (["d", "debito", "debit", "saida", "out", "pagamento", "despesa"].includes(value)) return "PAYABLE";
  return null;
}

export function parseStatementCsv(text: string, mapping?: StatementMapping, accountId?: string): StatementParseResult {
  const rows = parseCsv(text, delimiterOf(text));
  const headers = rows.length ? Object.keys(rows[0]!) : [];
  if (!mapping) return { headers, sample: rows.slice(0, 5), lines: [], invalidCount: 0, duplicateCount: 0 };
  const seen = new Set<string>();
  const occurrences = new Map<string, number>();
  const lines: ParsedStatementLine[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;
  for (const row of rows) {
    const postedOn = parseDate(row[mapping.date] ?? "");
    const description = (row[mapping.description] ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
    const parsed = parseAmount(row[mapping.amount] ?? "");
    const direction = parsed ? directionOf(mapping.direction ? row[mapping.direction] : undefined, parsed.negative) : null;
    const reference = mapping.reference ? (row[mapping.reference] ?? "").trim().slice(0, 250) : "";
    if (!postedOn || !description || !parsed || !direction) {
      invalidCount++;
      continue;
    }
    const stable = reference
      ? `ref:${postedOn}|${reference.normalize("NFKC").toLowerCase()}`
      : `row:${postedOn}|${direction}|${parsed.amount}|${description.normalize("NFKC").toLowerCase()}`;
    const occurrence = occurrences.get(stable) ?? 0;
    occurrences.set(stable, occurrence + 1);
    const base = reference ? stable : `${stable}|occurrence:${occurrence}`;
    const fingerprint = createHash("sha256").update(`${accountId ?? ""}|${base}`).digest("hex");
    if (seen.has(fingerprint)) {
      duplicateCount++;
      continue;
    }
    seen.add(fingerprint);
    lines.push({ fingerprint, postedOn, description, amount: parsed.amount, direction });
  }
  return { headers, sample: rows.slice(0, 5), lines, invalidCount, duplicateCount };
}
