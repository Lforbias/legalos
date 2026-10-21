import { createHash } from "node:crypto";
import { isValidCnj, formatCnj } from "@/lib/validation/br-documents";
import { isYmd } from "@/lib/dates/ymd";

export type NoticeKindKey = "INTIMACAO" | "CITACAO" | "DESPACHO" | "DECISAO" | "SENTENCA" | "OUTRO";

export type ParsedNotice = {
  caseNumber: string | null;
  publishedAt: string | null;
  kind: NoticeKindKey | null;
  /** Prazo mencionado no texto (SUGESTÃO — sempre conferir). */
  suggestedDays: number | null;
  suggestedCount: "BUSINESS" | "CALENDAR" | null;
  court: string | null;
};

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Hash do conteúdo normalizado (sem acentos, caixa, espaços): detecta o mesmo texto recebido duas vezes. */
export function contentHash(text: string): string {
  return createHash("sha256").update(strip(text).replace(/\s+/g, " ").trim()).digest("hex");
}

/** Extrai informações do texto colado. Tudo é SUGESTÃO: nada é gravado sem a conferência da pessoa. */
export function parseNoticeText(text: string): ParsedNotice {
  const t = text.slice(0, 50_000);
  const flat = strip(t);

  let caseNumber: string | null = null;
  for (const m of t.matchAll(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g)) {
    if (isValidCnj(m[0])) {
      caseNumber = formatCnj(m[0]);
      break;
    }
  }
  if (!caseNumber) {
    for (const m of t.matchAll(/\b\d{20}\b/g)) {
      if (isValidCnj(m[0])) {
        caseNumber = formatCnj(m[0]);
        break;
      }
    }
  }

  let publishedAt: string | null = null;
  const dateRe = /(?:publica\w*|disponibiliza\w*|data\s+da\s+publica\w*)[^0-9]{0,40}(\d{2})\/(\d{2})\/(\d{4})/;
  const d = flat.match(dateRe);
  if (d) {
    const ymd = `${d[3]}-${d[2]}-${d[1]}`;
    if (isYmd(ymd)) publishedAt = ymd;
  }

  let kind: NoticeKindKey | null = null;
  if (/\bcitacao\b|\bcite-se\b/.test(flat)) kind = "CITACAO";
  else if (/\bsentenca\b|\bjulgo\s+(procedente|improcedente|parcialmente)/.test(flat)) kind = "SENTENCA";
  else if (/\bdecisao interlocutoria\b|\bdecisao\b/.test(flat)) kind = "DECISAO";
  else if (/\bdespacho\b/.test(flat)) kind = "DESPACHO";
  else if (/\bintima\w*\b/.test(flat)) kind = "INTIMACAO";

  let suggestedDays: number | null = null;
  let suggestedCount: "BUSINESS" | "CALENDAR" | null = null;
  const p = flat.match(/prazo\s+(?:legal\s+)?de\s+(\d{1,3})\s*(?:\(\w+(?:\s\w+)?\)\s*)?dias?(\s+uteis|\s+corridos)?/);
  if (p) {
    suggestedDays = Number(p[1]);
    if (p[2]?.includes("uteis")) suggestedCount = "BUSINESS";
    else if (p[2]?.includes("corridos")) suggestedCount = "CALENDAR";
  }

  const c = t.match(/\b((?:Tribunal|TJ|TRF|TRT|TST|STJ|STF)\b[^\n,.;]{2,60})/i);
  return { caseNumber, publishedAt, kind, suggestedDays, suggestedCount, court: c ? c[1]!.trim() : null };
}
