/**
 * Cliente do DJEN (Diário de Justiça Eletrônico Nacional) — consulta PÚBLICA de comunicações por OAB.
 * ATENÇÃO: esta consulta não tem documentação oficial estável do CNJ que eu tenha conseguido confirmar;
 * o contrato abaixo vem de relatos de integradores e é tratado de forma defensiva (campos opcionais, aliases).
 * Relatos: sem autenticação, bloqueio (403) para IPs fora do Brasil, teto prático de 50 itens por página,
 * erros 5xx em rajadas. Por isso: espaçamento entre chamadas, repetição com espera crescente e página de 50.
 */
import { onlyDigits } from "@/lib/validation/br-documents";

export class DjenError extends Error {}

export const DJEN_PAGE_SIZE = 50;
const MAX_PAGES = 40;
const DEFAULT_BASE = "https://comunicaapi.pje.jus.br/api/v1";

export type DjenHttp = (url: string) => Promise<{ status: number; body: string }>;

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
};

export const djenBase = () => (process.env.DJEN_API_BASE?.trim() || DEFAULT_BASE).replace(/\/+$/, "");

function assertBase(base: string) {
  const u = new URL(base);
  const local = process.env.NODE_ENV === "test" || process.env.DJEN_ALLOW_LOCAL === "1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw new DjenError("O endereço do DJEN precisa ser https.");
}

export const defaultHttp: DjenHttp = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "LegalOS/1.0" }, signal: AbortSignal.timeout(30_000), redirect: "error" });
  const buf = await res.text();
  if (buf.length > 20 * 1024 * 1024) throw new DjenError("Resposta do DJEN grande demais.");
  return { status: res.status, body: buf };
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
  };
}

export type DjenQuery = { numeroOab: string; ufOab: string; inicio: string; fim: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca todas as páginas da janela. `pauseMs` espaça as chamadas (padrão 500 ms; testes passam 0). */
export async function fetchDjen(q: DjenQuery, http: DjenHttp = defaultHttp, opts: { pauseMs?: number; retries?: number } = {}): Promise<{ items: DjenItem[]; skipped: number }> {
  const base = djenBase();
  assertBase(base);
  const pause = opts.pauseMs ?? 500;
  const retries = opts.retries ?? 3;
  const items: DjenItem[] = [];
  let skipped = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ numeroOab: q.numeroOab, ufOab: q.ufOab, dataDisponibilizacaoInicio: q.inicio, dataDisponibilizacaoFim: q.fim, pagina: String(page), itensPorPagina: String(DJEN_PAGE_SIZE) });
    const url = `${base}/comunicacao?${params.toString()}`;
    let body = "";
    for (let attempt = 0; ; attempt++) {
      const r = await http(url);
      if (r.status === 403) throw new DjenError("O DJEN recusou o acesso (403). Relatos indicam bloqueio de servidores fora do Brasil: hospede o sistema em um servidor no Brasil.");
      if (r.status === 429 || r.status >= 500) {
        if (attempt >= retries) throw new DjenError(`O DJEN está instável (HTTP ${r.status}). Tente novamente mais tarde.`);
        await sleep(Math.min(8000, 500 * 2 ** attempt) * (pause === 0 ? 0 : 1));
        continue;
      }
      if (r.status < 200 || r.status >= 300) throw new DjenError(`O DJEN respondeu HTTP ${r.status}.`);
      body = r.body;
      break;
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new DjenError("Resposta do DJEN em formato inesperado (não é JSON).");
    }
    const list = typeof json === "object" && json !== null ? (json as { items?: unknown }).items : undefined;
    if (!Array.isArray(list)) throw new DjenError("Resposta do DJEN em formato inesperado (sem lista de itens).");
    for (const raw of list) {
      const it = parseDjenItem(raw);
      if (it) items.push(it);
      else skipped++;
    }
    if (list.length < DJEN_PAGE_SIZE) return { items, skipped };
    if (pause) await sleep(pause);
  }
  throw new DjenError("Janela com resultados demais para uma sincronização; reduza o período.");
}
