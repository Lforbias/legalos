/**
 * Envio de documentos em lote: regras puras (sem banco) para aceitar arquivos e sugerir a qual
 * processo ou cliente cada um pertence, a partir do caminho (pastas + nome do arquivo).
 *
 * Ordem das regras (a primeira que acerta vence):
 *  1. Número CNJ válido em qualquer parte do caminho → processo com esse número.
 *  2. CPF/CNPJ válido em qualquer parte do caminho → cliente com esse documento.
 *  3. Nome de uma pasta (da mais interna para a mais externa) igual ao nome de um cliente, ou
 *     começando pelo nome do cliente seguido de separador ("Maria Silva - Trabalhista") → cliente.
 * Empates (dois clientes com o mesmo nome) não são resolvidos: a pessoa escolhe.
 */
import { isValidCnj, isValidCnpj, isValidCpf, onlyDigits } from "@/lib/validation/br-documents";

/** Extensões aceitas pelo upload (espelha ALLOWED_TYPES do serviço de documentos; um teste garante a igualdade). */
export const BULK_ACCEPTED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "docx", "xlsx", "pptx", "odt", "doc", "xls", "txt", "csv"] as const;
export const BULK_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const BULK_MAX_FILES = 500;
export const BULK_MAX_ZIP_BYTES = 300 * 1024 * 1024;

export type BulkCatalog = {
  cases: { id: string; number: string | null; title: string }[];
  clients: { id: string; name: string; document: string | null }[];
};

export type BulkOwner = { kind: "case" | "client"; id: string; label: string };
export type BulkMatch = { owner: BulkOwner | null; reason: string };

export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
}

/** Arquivos de sistema e ocultos que vêm dentro de pastas e ZIPs e nunca devem ser enviados. */
export function isJunkPath(path: string): boolean {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.some((p) => p === "__MACOSX" || p.startsWith("."))) return true;
  const base = parts.at(-1) ?? "";
  return /^(thumbs\.db|desktop\.ini|~\$.*)$/i.test(base);
}

/** Motivo para recusar o arquivo antes do envio, ou null se ele pode seguir. */
export function rejectReason(name: string, size: number): string | null {
  const ext = fileExtension(name);
  if (!(BULK_ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return ext ? `Formato .${ext} não aceito` : "Arquivo sem extensão";
  if (size === 0) return "Arquivo vazio";
  if (size > BULK_MAX_FILE_BYTES) return "Maior que 8 MB";
  return null;
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CNJ_IN_TEXT = /(?<!\d)(\d{7})[-.\s]?(\d{2})[.\s]?(\d{4})[.\s]?(\d)[.\s]?(\d{2})[.\s]?(\d{4})(?!\d)/g;
/** Números CNJ válidos encontrados no texto, só com dígitos (20). */
export function cnjDigitsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CNJ_IN_TEXT)) {
    const digits = m.slice(1, 7).join("");
    const formatted = `${m[1]}-${m[2]}.${m[3]}.${m[4]}.${m[5]}.${m[6]}`;
    if (isValidCnj(formatted)) out.push(digits);
  }
  return out;
}

const CPF_IN_TEXT = /(?<![\d])(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-.\s]?(\d{2})(?![\d])/g;
const CNPJ_IN_TEXT = /(?<![\d])(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[-.\s]?(\d{2})(?![\d])/g;
/** CPFs e CNPJs (numéricos) válidos encontrados no texto, só com dígitos. */
export function taxIdDigitsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CNPJ_IN_TEXT)) {
    const d = m.slice(1, 6).join("");
    if (isValidCnpj(d)) out.push(d);
  }
  for (const m of text.matchAll(CPF_IN_TEXT)) {
    const d = m.slice(1, 5).join("");
    if (isValidCpf(d)) out.push(d);
  }
  return out;
}

export type BulkIndex = {
  caseByCnj: Map<string, BulkCatalog["cases"][number]>;
  clientByTaxId: Map<string, BulkCatalog["clients"][number]>;
  clientsByName: Map<string, BulkCatalog["clients"][number][]>;
};

export function buildBulkIndex(catalog: BulkCatalog): BulkIndex {
  const caseByCnj = new Map<string, BulkCatalog["cases"][number]>();
  for (const c of catalog.cases) {
    const d = c.number ? onlyDigits(c.number) : "";
    if (d.length === 20 && !caseByCnj.has(d)) caseByCnj.set(d, c);
  }
  const clientByTaxId = new Map<string, BulkCatalog["clients"][number]>();
  const clientsByName = new Map<string, BulkCatalog["clients"][number][]>();
  for (const c of catalog.clients) {
    const d = c.document ? c.document.replace(/[^0-9A-Za-z]/g, "").toUpperCase() : "";
    if (d && !clientByTaxId.has(d)) clientByTaxId.set(d, c);
    const n = normalizeName(c.name);
    if (n.length >= 3) clientsByName.set(n, [...(clientsByName.get(n) ?? []), c]);
  }
  return { caseByCnj, clientByTaxId, clientsByName };
}

const caseLabel = (c: BulkCatalog["cases"][number]) => (c.number ? `${c.number} · ${c.title}` : c.title);

/** Sugere o vínculo de um arquivo pelo caminho relativo (ex.: "Clientes/Maria Silva/procuracao.pdf"). */
export function matchBulkPath(path: string, index: BulkIndex): BulkMatch {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const full = parts.join(" / ");

  for (const digits of cnjDigitsIn(full)) {
    const c = index.caseByCnj.get(digits);
    if (c) return { owner: { kind: "case", id: c.id, label: caseLabel(c) }, reason: "Número do processo no nome" };
  }
  for (const digits of taxIdDigitsIn(full)) {
    const c = index.clientByTaxId.get(digits);
    if (c) return { owner: { kind: "client", id: c.id, label: c.name }, reason: "CPF/CNPJ no nome" };
  }

  const folders = parts.slice(0, -1).reverse();
  let ambiguous = false;
  for (const folder of folders) {
    const n = normalizeName(folder);
    if (!n) continue;
    const exact = index.clientsByName.get(n);
    if (exact?.length === 1) return { owner: { kind: "client", id: exact[0]!.id, label: exact[0]!.name }, reason: "Nome da pasta igual ao cliente" };
    if (exact && exact.length > 1) {
      ambiguous = true;
      continue;
    }
    // "Maria Silva - Trabalhista": o nome do cliente seguido de outras palavras; vale o nome mais longo e único.
    const words = n.split(" ");
    for (let size = words.length - 1; size >= 2; size--) {
      const found = index.clientsByName.get(words.slice(0, size).join(" "));
      if (found?.length === 1) return { owner: { kind: "client", id: found[0]!.id, label: found[0]!.name }, reason: "Nome da pasta começa com o cliente" };
      if (found && found.length > 1) {
        ambiguous = true;
        break;
      }
    }
  }
  return { owner: null, reason: ambiguous ? "Mais de um cliente com esse nome: escolha" : "Sem vínculo encontrado: escolha" };
}
