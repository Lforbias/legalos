/**
 * Cliente do DJEN (Diário de Justiça Eletrônico Nacional) — consulta PÚBLICA de comunicações por OAB.
 *
 * ATENÇÃO (honestidade): esta consulta não tem documentação oficial estável do CNJ que tenha sido confirmada.
 * O contrato abaixo vem de relatos de integradores e é tratado de forma DEFENSIVA (campos opcionais, aliases);
 * o que não puder ser interpretado é contado em `skipped`, nunca inventado. A primeira verificação real a partir
 * do servidor (npm run djen:probe ou a verificação do Box) registra a evidência do contrato de verdade.
 * Relatos: sem autenticação; o serviço (CloudFront) recusa IPs de fora do Brasil (403); teto prático de 50 itens
 * por página; erros 429/5xx em rajadas. Por isso: espaçamento entre chamadas, repetição com espera crescente.
 */
import { hashRaw } from "@/lib/judicial/communication";
import type { OperationFailure } from "@/lib/judicial/contracts";
import { onlyDigits } from "@/lib/validation/br-documents";

export type DjenFailureCode = OperationFailure["code"];

export class DjenError extends Error {
  constructor(message: string, public code: DjenFailureCode = "INTERNAL", public retryable = false, public retryAfterSec?: number) {
    super(message);
  }
}

export const DJEN_PAGE_SIZE = 50;
const MAX_PAGES = 40;
const DEFAULT_BASE = "https://comunicaapi.pje.jus.br/api/v1";

export type DjenHttp = (url: string) => Promise<{ status: number; body: string; headers?: Record<string, string> }>;

export type DjenLawyer = { name: string | null; oab: string | null; uf: string | null };

export type DjenItem = {
  id: string;
  hash: string | null;
  disponibilizadoEm: string | null; // YYYY-MM-DD
  tribunal: string | null;
  orgao: string | null;
  classe: string | null;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  numeroProcesso: string | null; // 20 dígitos
  texto: string;
  link: string | null;
  cancelada: boolean;
  /** Advogados destinatários informados pela fonte (para conferir a quem a publicação se destina). */
  lawyers: DjenLawyer[];
  /** Hash do item bruto: prova de integridade da captura. */
  rawHash: string;
};

export const djenBase = () => (process.env.DJEN_API_BASE?.trim() || DEFAULT_BASE).replace(/\/+$/, "");

function assertBase(base: string) {
  const u = new URL(base);
  const local = process.env.NODE_ENV === "test" || process.env.DJEN_ALLOW_LOCAL === "1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw new DjenError("O endereço do DJEN precisa ser https.", "INTERNAL");
}

export const defaultHttp: DjenHttp = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "LegalOS/1.0" }, signal: AbortSignal.timeout(30_000), redirect: "error" });
  const buf = await res.text();
  if (buf.length > 20 * 1024 * 1024) throw new DjenError("Resposta do DJEN grande demais.", "INVALID_RESPONSE");
  return { status: res.status, body: buf, headers: { "retry-after": res.headers.get("retry-after") ?? "" } };
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return null;
};

function ymd(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (m) return m[1]!;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

function lawyersOf(o: Record<string, unknown>): DjenLawyer[] {
  const list = o["destinatarioadvogados"] ?? o["destinatarios_advogados"];
  if (!Array.isArray(list)) return [];
  const out: DjenLawyer[] = [];
  for (const r of list) {
    if (typeof r !== "object" || r === null) continue;
    const a = (r as Record<string, unknown>)["advogado"];
    if (typeof a !== "object" || a === null) continue;
    const ad = a as Record<string, unknown>;
    out.push({ name: pick(ad, "nome", "name"), oab: pick(ad, "numero_oab", "numeroOab"), uf: pick(ad, "uf_oab", "ufOab") });
  }
  return out.slice(0, 20);
}

/** Converte um item bruto; devolve null se faltar identificador ou texto (nunca inventa conteúdo). */
export function parseDjenItem(raw: unknown): DjenItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = pick(o, "id", "numeroComunicacao", "numero_comunicacao");
  const texto = pick(o, "texto", "conteudo");
  if (!id || !texto) return null;
  const proc = pick(o, "numero_processo", "numeroProcesso");
  const ativo = o["ativo"];
  const status = (pick(o, "status") ?? "").toLowerCase();
  return {
    id,
    hash: pick(o, "hash"),
    disponibilizadoEm: ymd(pick(o, "data_disponibilizacao", "dataDisponibilizacao", "datadisponibilizacao")),
    tribunal: pick(o, "siglaTribunal", "sigla_tribunal"),
    orgao: pick(o, "nomeOrgao", "nome_orgao"),
    classe: pick(o, "nomeClasse", "nome_classe"),
    tipoComunicacao: pick(o, "tipoComunicacao", "tipo_comunicacao"),
    tipoDocumento: pick(o, "tipoDocumento", "tipo_documento"),
    numeroProcesso: proc ? onlyDigits(proc) : null,
    texto,
    link: pick(o, "link"),
    cancelada: ativo === false || status.includes("cancel"),
    lawyers: lawyersOf(o),
    rawHash: hashRaw(raw),
  };
}

export type DjenQuery = { numeroOab: string; ufOab: string; inicio: string; fim: string; siglaTribunal?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function urlFor(q: DjenQuery, page: number, pageSize: number): string {
  const params = new URLSearchParams({ numeroOab: q.numeroOab, ufOab: q.ufOab, dataDisponibilizacaoInicio: q.inicio, dataDisponibilizacaoFim: q.fim, pagina: String(page), itensPorPagina: String(pageSize) });
  if (q.siglaTribunal) params.set("siglaTribunal", q.siglaTribunal);
  return `${djenBase()}/comunicacao?${params.toString()}`;
}

/** Classifica uma resposta HTTP que não é sucesso. */
export function djenFailureFor(status: number, body: string, headers?: Record<string, string>): DjenError {
  if (status === 403) {
    const geo = /country|país|cloudfront/i.test(body);
    return new DjenError("O DJEN recusou o acesso (403). Relatos indicam bloqueio de servidores fora do Brasil: hospede o sistema em um servidor no Brasil.", geo ? "GEO_BLOCKED" : "UNAVAILABLE", false);
  }
  if (status === 429) {
    const ra = Number(headers?.["retry-after"]);
    return new DjenError(`O DJEN limitou as consultas (HTTP 429). Tente novamente mais tarde.`, "RATE_LIMITED", true, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }
  if (status >= 500) return new DjenError(`O DJEN está instável (HTTP ${status}). Tente novamente mais tarde.`, "UNAVAILABLE", true);
  return new DjenError(`O DJEN respondeu HTTP ${status}.`, "INVALID_RESPONSE", false);
}

export type DjenPage = {
  items: DjenItem[];
  /** Itens brutos que não puderam ser interpretados. */
  skipped: number;
  /** Itens brutos desta página (antes de filtrar). */
  rawCount: number;
  /** Total informado pelo serviço, quando informa (campo `count`). */
  reportedTotal: number | null;
  hasMore: boolean;
};

/** Busca UMA página (com repetição e espera crescente para 429/5xx). Base do checkpoint por página. */
export async function fetchDjenPage(q: DjenQuery, page: number, http: DjenHttp = defaultHttp, opts: { pauseMs?: number; retries?: number; pageSize?: number } = {}): Promise<DjenPage> {
  assertBase(djenBase());
  const pause = opts.pauseMs ?? 500;
  const retries = opts.retries ?? 3;
  const pageSize = opts.pageSize ?? DJEN_PAGE_SIZE;
  const url = urlFor(q, page, pageSize);
  let body = "";
  for (let attempt = 0; ; attempt++) {
    let r: Awaited<ReturnType<DjenHttp>>;
    try {
      r = await http(url);
    } catch (e) {
      if (e instanceof DjenError) throw e;
      if (attempt >= retries) throw new DjenError("Falha de comunicação com o DJEN.", e instanceof Error && e.name === "TimeoutError" ? "TIMEOUT" : "UNAVAILABLE", true);
      await sleep(Math.min(8000, 500 * 2 ** attempt) * (pause === 0 ? 0 : 1));
      continue;
    }
    if (r.status >= 200 && r.status < 300) {
      body = r.body;
      break;
    }
    const err = djenFailureFor(r.status, r.body, r.headers);
    if (!err.retryable || attempt >= retries) throw err;
    const wait = err.retryAfterSec ? Math.min(30, err.retryAfterSec) * 1000 : Math.min(8000, 500 * 2 ** attempt);
    await sleep(wait * (pause === 0 ? 0 : 1));
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new DjenError("Resposta do DJEN em formato inesperado (não é JSON).", "INVALID_RESPONSE");
  }
  const obj = typeof json === "object" && json !== null ? (json as { items?: unknown; count?: unknown }) : {};
  if (!Array.isArray(obj.items)) throw new DjenError("Resposta do DJEN em formato inesperado (sem lista de itens).", "INVALID_RESPONSE");
  const items: DjenItem[] = [];
  let skipped = 0;
  for (const raw of obj.items) {
    const it = parseDjenItem(raw);
    if (it) items.push(it);
    else skipped++;
  }
  const rt = typeof obj.count === "number" && Number.isFinite(obj.count) && obj.count >= 0 ? Math.floor(obj.count) : null;
  return { items, skipped, rawCount: obj.items.length, reportedTotal: rt, hasMore: obj.items.length >= pageSize };
}

/** Pergunta mínima (1 item) para saber se o serviço responde de verdade a uma consulta por OAB. Não grava nada. */
export async function checkDjenAvailability(q: Pick<DjenQuery, "numeroOab" | "ufOab" | "inicio" | "fim">, http: DjenHttp = defaultHttp): Promise<{ latencyMs: number; shape: "ITEMS_ARRAY"; reportedTotal: number | null }> {
  const t0 = Date.now();
  const p = await fetchDjenPage(q, 1, http, { pauseMs: 0, retries: 1, pageSize: 1 });
  return { latencyMs: Date.now() - t0, shape: "ITEMS_ARRAY", reportedTotal: p.reportedTotal };
}

/** Busca todas as páginas da janela. `pauseMs` espaça as chamadas (padrão 500 ms; testes passam 0). */
export async function fetchDjen(q: DjenQuery, http: DjenHttp = defaultHttp, opts: { pauseMs?: number; retries?: number } = {}): Promise<{ items: DjenItem[]; skipped: number; reportedTotal: number | null; rawCount: number }> {
  const pause = opts.pauseMs ?? 500;
  const items: DjenItem[] = [];
  let skipped = 0;
  let rawCount = 0;
  let reportedTotal: number | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const p = await fetchDjenPage(q, page, http, opts);
    items.push(...p.items);
    skipped += p.skipped;
    rawCount += p.rawCount;
    if (p.reportedTotal !== null) reportedTotal = p.reportedTotal;
    if (!p.hasMore) return { items, skipped, reportedTotal, rawCount };
    if (pause) await sleep(pause);
  }
  throw new DjenError("Janela com resultados demais para uma sincronização; reduza o período.", "INVALID_RESPONSE");
}
