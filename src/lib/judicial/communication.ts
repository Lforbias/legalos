import { createHash } from "node:crypto";
import { formatCnj, isValidCnj, onlyDigits } from "@/lib/validation/br-documents";
import type { NormalizedCommunication, NoticeKindKey } from "./contracts";

/** JSON com chaves ordenadas: o mesmo conteúdo gera sempre o mesmo hash. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

/** Hash de integridade do que a fonte devolveu (prova a captura sem guardar o texto no registro de evidência). */
export const hashRaw = (raw: unknown): string => createHash("sha256").update(stableStringify(raw)).digest("hex");

/**
 * Chave de idempotência por fonte + identificador oficial. Mantém o formato legado ("djen:<id>") para que
 * as comunicações já gravadas continuem sendo reconhecidas e nunca sejam duplicadas.
 */
export const sourceKeyOf = (sourceSystem: string, officialId: string) => `${sourceSystem}:${officialId}`;

export const KIND_LABEL: Record<NoticeKindKey, string> = { INTIMACAO: "Intimação", CITACAO: "Citação", DESPACHO: "Despacho", DECISAO: "Decisão", SENTENCA: "Sentença", OUTRO: "Comunicação" };

/** Tipo da comunicação a partir dos textos da fonte (preserva as diferenças; nunca vira um tipo único e indiferenciado). */
export function kindFromSource(tipoDocumento: string | null, tipoComunicacao: string | null): NoticeKindKey {
  const s = `${tipoDocumento ?? ""} ${tipoComunicacao ?? ""}`.toLowerCase();
  if (s.includes("senten")) return "SENTENCA";
  if (s.includes("decis") || s.includes("acórd") || s.includes("acord")) return "DECISAO";
  if (s.includes("despacho")) return "DESPACHO";
  if (s.includes("cita")) return "CITACAO";
  if (s.includes("intima")) return "INTIMACAO";
  return "OUTRO";
}

/** CNJ formatado, só se tiver 20 dígitos e dígito verificador válido. */
export function cnjFromDigits(digits: string | null | undefined): string | null {
  const d = digits ? onlyDigits(digits) : "";
  if (d.length !== 20) return null;
  const f = formatCnj(d);
  return isValidCnj(f) ? f : null;
}

export type CaseCandidate = { id: string; number: string | null };
export type CaseMatchState = "LINKED" | "AMBIGUOUS" | "NOT_FOUND" | "NO_CNJ";

/**
 * Vinculação segura ao processo: só vincula sozinho quando há UM único processo com aquele CNJ.
 * Mais de um = ambíguo (pede confirmação manual). Nenhum = não encontrado (não cria processo duplicado).
 */
export function decideCaseMatch(cnj: string | null, candidates: readonly CaseCandidate[]): { state: CaseMatchState; caseId: string | null } {
  if (!cnj) return { state: "NO_CNJ", caseId: null };
  const same = candidates.filter((c) => c.number === cnj);
  if (same.length === 1) return { state: "LINKED", caseId: same[0]!.id };
  if (same.length > 1) return { state: "AMBIGUOUS", caseId: null };
  return { state: "NOT_FOUND", caseId: null };
}

/** Texto de cabeçalho que deixa claro, dentro da própria comunicação, o que ela é e o que NÃO foi feito. */
export function djenHeader(n: Pick<NormalizedCommunication, "officialId" | "courtCode" | "orgao" | "classe">, oab: string): string {
  return `Publicação no DJEN nº ${n.officialId}${n.courtCode ? ` — ${n.courtCode}` : ""}${n.orgao ? ` — ${n.orgao}` : ""}${n.classe ? ` (classe ${n.classe})` : ""}.\nCapturada pelo monitoramento da OAB ${oab}. Prazos criados a partir desta publicação continuam como rascunho até validação humana.\n\n`;
}
