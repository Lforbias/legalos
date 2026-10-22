import { db } from "@/lib/db/client";
import { todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { correct, INDEX_SERIES, parseRate, type CorrectionResult, type IndexSeries } from "@/lib/finance/correction";
import { ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/** Códigos das séries no SGS do Banco Central (dados públicos). */
export const BCB_CODE: Record<IndexSeries, number> = { INPC: 188, IPCA: 433, SELIC: 4390 };

/** Converte a resposta do SGS ([{data:"01/08/2026", valor:"0.46"}]) em linhas mensais. Ignora linhas malformadas. */
export function parseBcbSeries(json: unknown): { month: string; rate: string }[] {
  if (!Array.isArray(json)) return [];
  const out = new Map<string, string>();
  for (const r of json) {
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String((r as { data?: unknown })?.data ?? ""));
    const v = String((r as { valor?: unknown })?.valor ?? "").trim();
    if (!d || parseRate(v) === null) continue;
    out.set(`${d[3]}-${d[2]}-01`, v);
  }
  return [...out].map(([month, rate]) => ({ month, rate }));
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function upsertOfficial(series: IndexSeries, rows: { month: string; rate: string }[]) {
  let n = 0;
  for (const r of rows) {
    const where = { organizationId: null, series, month: ymdToDate(r.month) };
    const found = await db.monetaryIndex.findFirst({ where, select: { id: true } });
    if (found) await db.monetaryIndex.update({ where: { id: found.id }, data: { ratePercent: r.rate } });
    else await db.monetaryIndex.create({ data: { ...where, ratePercent: r.rate, source: "BCB" } });
    n++;
  }
  return n;
}

/** Busca no Banco Central os índices mensais (últimos `years` anos) e grava como oficiais. Idempotente. */
export async function syncOfficialIndexes(ctx: TenantContext, opts: { years?: number; fetchImpl?: FetchLike } = {}) {
  assertCan(ctx, "organization:manage");
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const today = todayYmd(ctx.timezone);
  const startYear = Number(today.slice(0, 4)) - Math.min(Math.max(opts.years ?? 6, 1), 35);
  const br = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
  const result: Record<string, { saved: number; error?: string }> = {};
  for (const series of INDEX_SERIES) {
    try {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BCB_CODE[series]}/dados?formato=json&dataInicial=${br(`${startYear}-01-01`)}&dataFinal=${br(today)}`;
      const res = await doFetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`BCB respondeu ${res.status}`);
      const rows = parseBcbSeries(await res.json());
      if (rows.length === 0) throw new Error("Resposta sem dados.");
      result[series] = { saved: await upsertOfficial(series, rows) };
    } catch (e) {
      result[series] = { saved: 0, error: e instanceof Error ? e.message : "Falha ao consultar o BCB." };
    }
  }
  await audit({ action: "finance.indexes_sync", organizationId: ctx.organizationId, userId: ctx.userId, metadata: result, meta: ctx.meta });
  return result;
}

/** Lançamento manual do escritório para um mês (tem prioridade sobre o oficial). */
export async function setManualIndex(ctx: TenantContext, series: string, month: string, rate: string) {
  assertCan(ctx, "finance:manage");
  if (!(INDEX_SERIES as readonly string[]).includes(series)) throw new ValidationError("Índice inválido.");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError("Mês inválido.", { month: ["Mês inválido."] });
  if (parseRate(rate) === null) throw new ValidationError("Taxa inválida. Exemplo: 0,46", { rate: ["Taxa inválida. Exemplo: 0,46"] });
  const where = { organizationId: ctx.organizationId, series, month: ymdToDate(`${month}-01`) };
  const found = await db.monetaryIndex.findFirst({ where, select: { id: true } });
  if (found) await db.monetaryIndex.update({ where: { id: found.id }, data: { ratePercent: rate } });
  else await db.monetaryIndex.create({ data: { ...where, ratePercent: rate, source: "MANUAL" } });
  await audit({ action: "finance.index_manual", organizationId: ctx.organizationId, userId: ctx.userId, metadata: { series, month, rate }, meta: ctx.meta });
}

async function rateMap(ctx: TenantContext, series: IndexSeries, fromYmd: string, toYmd: string) {
  const rows = await db.monetaryIndex.findMany({
    where: { series, month: { gte: ymdToDate(`${fromYmd.slice(0, 7)}-01`), lt: ymdToDate(`${toYmd.slice(0, 7)}-01`) }, OR: [{ organizationId: null }, { organizationId: ctx.organizationId }] },
    select: { organizationId: true, month: true, ratePercent: true },
  });
  const map = new Map<string, string>();
  for (const r of rows.filter((x) => x.organizationId === null)) map.set(r.month.toISOString().slice(0, 7), r.ratePercent.toString());
  for (const r of rows.filter((x) => x.organizationId !== null)) map.set(r.month.toISOString().slice(0, 7), r.ratePercent.toString());
  return map;
}

export async function correctValue(ctx: TenantContext, v: { value: string; series: IndexSeries; baseDate: string; targetDate?: string }): Promise<CorrectionResult> {
  assertCan(ctx, "cases:read");
  const target = v.targetDate ?? todayYmd(ctx.timezone);
  return correct(v.value, v.baseDate, target, await rateMap(ctx, v.series, v.baseDate, target));
}

export async function indexCoverage(ctx: TenantContext) {
  assertCan(ctx, "cases:read");
  const rows = await db.monetaryIndex.groupBy({ by: ["series"], where: { OR: [{ organizationId: null }, { organizationId: ctx.organizationId }] }, _count: true, _max: { month: true } });
  return INDEX_SERIES.map((s) => {
    const r = rows.find((x) => x.series === s);
    return { series: s, months: r?._count ?? 0, last: r?._max.month ? r._max.month.toISOString().slice(0, 7) : null };
  });
}
