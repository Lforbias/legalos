import { parseCsv } from "@/lib/import/csv";
import { isValidCnpj, normalizeCnpj } from "@/lib/validation/br-documents";

export type ImportRow = {
  cnpj: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  rankingPosition: number | null;
  rankingSource: string | null;
  lawyersEstimate: number | null;
  areas: string[];
  tags: string[];
  street: string | null;
  number: string | null;
  district: string | null;
  zip: string | null;
};
export type ImportParse = { rows: ImportRow[]; errors: string[] };

/** Excel brasileiro salva com ";". Troca o separador fora de aspas só quando o cabeçalho não tem ",". */
export function normalizeDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  if (!first.includes(";") || first.includes(",")) return text;
  let out = "";
  let q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    out += ch === ";" && !q ? "," : ch;
  }
  return out;
}

const norm = (k: string) => k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIAS: Record<string, string> = {
  cnpj: "cnpj", nome: "name", escritorio: "name", razaosocial: "name", name: "name",
  telefone: "phone", fone: "phone", phone: "phone", email: "email", site: "website", website: "website",
  ranking: "ranking", posicao: "ranking", fonte: "source", fonteranking: "source", advogados: "lawyers", qtdadvogados: "lawyers",
  areas: "areas", areasdeatuacao: "areas", tags: "tags", rua: "street", logradouro: "street", endereco: "street", numero: "number",
  bairro: "district", cep: "zip",
};
const list = (v: string) => v.split(/[|;,]/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
const intOrNull = (v?: string) => {
  const n = Number(String(v ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 && String(v ?? "").trim() ? n : null;
};

export function parseImport(text: string): ImportParse {
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const parsed = parseCsv(normalizeDelimiter(text));
  parsed.forEach((raw, idx) => {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = ALIAS[norm(k)];
      if (key) r[key] = (v ?? "").trim();
    }
    const line = idx + 2;
    const cnpjRaw = r.cnpj ?? "";
    const cnpj = cnpjRaw ? normalizeCnpj(cnpjRaw) : "";
    if (cnpj && !isValidCnpj(cnpj)) {
      errors.push(`Linha ${line}: CNPJ inválido (${cnpjRaw}).`);
      return;
    }
    if (cnpj && seen.has(cnpj)) {
      errors.push(`Linha ${line}: CNPJ repetido na planilha (${cnpjRaw}).`);
      return;
    }
    const name = r.name || (cnpj ? cnpj : "");
    if (!name) {
      errors.push(`Linha ${line}: sem nome nem CNPJ.`);
      return;
    }
    if (cnpj) seen.add(cnpj);
    rows.push({
      cnpj: cnpj || null,
      name: name.slice(0, 160),
      phone: r.phone || null,
      email: r.email ? r.email.toLowerCase() : null,
      website: r.website || null,
      rankingPosition: intOrNull(r.ranking),
      rankingSource: r.source || null,
      lawyersEstimate: intOrNull(r.lawyers),
      areas: r.areas ? list(r.areas) : [],
      tags: r.tags ? list(r.tags) : [],
      street: r.street || null,
      number: r.number || null,
      district: r.district || null,
      zip: r.zip ? r.zip.replace(/\D/g, "") || null : null,
    });
  });
  return { rows, errors };
}
