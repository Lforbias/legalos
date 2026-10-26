import { isValidCnpj, normalizeCnpj } from "@/lib/validation/br-documents";

/** Dados públicos do CNPJ (BrasilAPI, fonte: Receita Federal). Só preenche; a equipe confere e edita. Dados de sócios NÃO são importados (só o cadastro da empresa). */
export type CnpjData = {
  cnpj: string;
  name: string;
  legalName: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  cnae: string | null;
  openedAt: string | null;
  companySize: string | null;
  situation: string | null;
};

export class CnpjLookupError extends Error {}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const title = (v: string | null): string | null =>
  v ? v.toLowerCase().replace(/(^|[\s(/-])([a-zà-ú])/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase()) : null;

export function formatPhone(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return d.length >= 8 ? d : null;
}

export function parseBrasilApiCnpj(raw: unknown): CnpjData {
  const j = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cnpj = normalizeCnpj(String(j.cnpj ?? ""));
  const legal = s(j.razao_social);
  const fantasy = s(j.nome_fantasia);
  const street = [s(j.descricao_tipo_de_logradouro), s(j.logradouro)].filter(Boolean).join(" ") || null;
  const cnaeCode = j.cnae_fiscal != null ? String(j.cnae_fiscal) : null;
  const cnaeDesc = s(j.cnae_fiscal_descricao);
  return {
    cnpj,
    name: title(fantasy) ?? title(legal) ?? cnpj,
    legalName: title(legal),
    phone: formatPhone(j.ddd_telefone_1),
    phone2: formatPhone(j.ddd_telefone_2),
    email: s(j.email)?.toLowerCase() ?? null,
    street: title(street),
    number: s(j.numero),
    complement: title(s(j.complemento)),
    district: title(s(j.bairro)),
    city: title(s(j.municipio)),
    state: s(j.uf)?.toUpperCase() ?? null,
    zip: s(j.cep)?.replace(/\D/g, "") ?? null,
    cnae: cnaeCode ? `${cnaeCode}${cnaeDesc ? ` - ${cnaeDesc}` : ""}` : null,
    openedAt: s(j.data_inicio_atividade),
    companySize: s(j.porte),
    situation: s(j.descricao_situacao_cadastral),
  };
}

export async function lookupCnpj(input: string, fetchImpl: typeof fetch = fetch): Promise<CnpjData> {
  const cnpj = normalizeCnpj(input);
  if (!isValidCnpj(cnpj)) throw new CnpjLookupError("CNPJ inválido. Confira os 14 números.");
  const base = (process.env.CNPJ_API_URL ?? "https://brasilapi.com.br/api/cnpj/v1").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetchImpl(`${base}/${cnpj}`, { headers: { accept: "application/json", "user-agent": "LegalOS-Comercial/1.0" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new CnpjLookupError("Não foi possível consultar o CNPJ agora. Tente novamente em instantes.");
  }
  if (res.status === 404) throw new CnpjLookupError("CNPJ não encontrado na base pública.");
  if (res.status === 429) throw new CnpjLookupError("Muitas consultas seguidas. Aguarde um minuto e tente de novo.");
  if (!res.ok) throw new CnpjLookupError(`A consulta de CNPJ respondeu com erro (${res.status}).`);
  try {
    return parseBrasilApiCnpj(await res.json());
  } catch {
    throw new CnpjLookupError("Resposta inválida da consulta de CNPJ.");
  }
}
