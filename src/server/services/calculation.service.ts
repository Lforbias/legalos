import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { calcAtrasadosJf, type JfInput } from "@/lib/calc/jf";
import { calcTjsp, type TjspInput } from "@/lib/calc/tjsp";
import { calcRescisao, calcTrabalhistaAtualizacao, type LaborUpdateInput, type RescisaoInput } from "@/lib/calc/trabalhista";
import { calcPrazo } from "@/lib/calc/prazos";
import { CalcError, fx, memorial, type CalcResult, type RateMap } from "@/lib/calc/num";
import { REAJUSTE_INSS, REAJUSTE_SOURCE, TJSP_FACTORS, TJSP_SOURCE } from "@/lib/calc/bundled-tables";
import { toCsv, toXlsx } from "@/lib/calc/export";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { CALC_KINDS, CALC_KIND_LABEL, SCHEMAS, indexInputSchema, type CalcKind } from "@/modules/calculos/schemas";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible } from "./case.service";

export const CALC_SERIES = ["IPCAE", "TR", "TJSP", "REAJUSTE_INSS", "SALMIN"] as const;
export const SERIES_LABEL: Record<string, string> = {
  INPC: "INPC (% ao mês)", IPCA: "IPCA (% ao mês)", SELIC: "SELIC (% ao mês)", IPCAE: "IPCA-E (% ao mês)", TR: "TR (% ao mês)",
  TJSP: "Tabela Prática TJSP (fator do mês)", REAJUSTE_INSS: "Reajuste anual do INSS (% — lance em janeiro)", SALMIN: "Salário mínimo (R$ do mês)",
};

/** Lê uma série (oficial + do escritório, o do escritório vence) como mapa mês → valor. Reajuste do INSS usa o ANO como chave. */
async function seriesMap(orgId: string, series: string): Promise<RateMap> {
  const rows = await db.monetaryIndex.findMany({ where: { series, OR: [{ organizationId: null }, { organizationId: orgId }] }, select: { organizationId: true, month: true, ratePercent: true } });
  const map: RateMap = new Map();
  const key = (d: Date) => (series === "REAJUSTE_INSS" ? d.toISOString().slice(0, 4) : d.toISOString().slice(0, 7));
  for (const r of rows.filter((x) => x.organizationId === null)) map.set(key(r.month), r.ratePercent.toString());
  for (const r of rows.filter((x) => x.organizationId !== null)) map.set(key(r.month), r.ratePercent.toString());
  return map;
}

const parsedCache = <T,>(kind: CalcKind, raw: unknown): T => {
  const r = SCHEMAS[kind].safeParse(raw);
  if (!r.success) {
    const fields: Record<string, string[]> = {};
    for (const i of r.error.issues) (fields[i.path.join(".") || "_"] ??= []).push(i.message);
    throw new ValidationError(r.error.issues[0]?.message ?? "Dados inválidos.", fields);
  }
  return r.data as T;
};

/** Executa a calculadora (sem salvar). Erros de índice faltando voltam como ValidationError legível. */
export async function runCalculation(ctx: TenantContext, kind: CalcKind, raw: unknown): Promise<{ input: unknown; result: CalcResult }> {
  assertCan(ctx, "cases:read");
  if (!(CALC_KINDS as readonly string[]).includes(kind)) throw new ValidationError("Tipo de cálculo inválido.");
  const org = ctx.organizationId;
  const nowYm = todayYmd(ctx.timezone).slice(0, 7);
  const input = parsedCache<Record<string, unknown>>(kind, raw);
  try {
    if (kind === "JF_ATRASADOS") {
      const [inpc, selic, reajuste, salmin] = await Promise.all(["INPC", "SELIC", "REAJUSTE_INSS", "SALMIN"].map((s) => seriesMap(org, s)));
      return { input, result: calcAtrasadosJf(input as unknown as JfInput, { inpc: inpc!, selic: selic!, reajuste: reajuste!, salmin: salmin! }, nowYm) };
    }
    if (kind === "TJSP") {
      const [tabela, selic] = await Promise.all(["TJSP", "SELIC"].map((s) => seriesMap(org, s)));
      return { input, result: calcTjsp(input as unknown as TjspInput, { tabela: tabela!, selic: selic! }) };
    }
    if (kind === "TRABALHISTA") {
      const [tr, ipcae, selic] = await Promise.all(["TR", "IPCAE", "SELIC"].map((s) => seriesMap(org, s)));
      return { input, result: calcTrabalhistaAtualizacao(input as unknown as LaborUpdateInput, { tr: tr!, ipcae: ipcae!, selic: selic! }) };
    }
    if (kind === "RESCISAO") return { input, result: calcRescisao(input as unknown as RescisaoInput) };
    return { input, result: calcPrazo({ ...(input as { actKey: string; intimacao: string; processo?: string }), hoje: todayYmd(ctx.timezone) }) };
  } catch (e) {
    if (e instanceof CalcError) throw new ValidationError(e.message);
    throw e;
  }
}

export async function saveCalculation(ctx: TenantContext, kind: CalcKind, raw: unknown, opts: { caseId?: string | null } = {}) {
  assertCan(ctx, "cases:write");
  if (opts.caseId) await assertCaseVisible(ctx, opts.caseId);
  // recalcula no servidor: o resultado salvo nunca vem do navegador
  const { input, result } = await runCalculation(ctx, kind, raw);
  const row = await db.calculation.create({
    data: { organizationId: ctx.organizationId, caseId: opts.caseId ?? null, kind, title: result.title.slice(0, 250), input: input as Prisma.InputJsonValue, result: result as unknown as Prisma.InputJsonValue, total: result.total, createdById: ctx.userId },
    select: { id: true },
  });
  await audit({ action: "calculation.save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "calculation", resourceId: row.id, metadata: { kind, caseId: opts.caseId ?? null }, meta: ctx.meta });
  return row;
}

export async function listCalculations(ctx: TenantContext, opts: { caseId?: string; limit?: number } = {}) {
  assertCan(ctx, "cases:read");
  if (opts.caseId) await assertCaseVisible(ctx, opts.caseId);
  const rows = await db.calculation.findMany({
    where: { organizationId: ctx.organizationId, ...(opts.caseId ? { caseId: opts.caseId } : {}) },
    orderBy: { createdAt: "desc" }, take: Math.min(opts.limit ?? 100, 200),
    select: { id: true, kind: true, title: true, total: true, caseId: true, createdAt: true, createdById: true },
  });
  return rows.map((r) => ({ ...r, total: r.total.toString(), kindLabel: CALC_KIND_LABEL[r.kind as CalcKind] ?? r.kind }));
}

export async function getCalculation(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:read");
  const row = await db.calculation.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!row) throw new NotFoundError("Cálculo não encontrado.");
  if (row.caseId) await assertCaseVisible(ctx, row.caseId);
  return { ...row, total: row.total.toString(), result: row.result as unknown as CalcResult };
}

export async function deleteCalculation(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:write");
  const row = await getCalculation(ctx, id);
  await db.calculation.delete({ where: { id: row.id } });
  await audit({ action: "calculation.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "calculation", resourceId: id, meta: ctx.meta });
}

export async function exportCalculation(ctx: TenantContext, id: string, format: "csv" | "xlsx" | "txt") {
  const c = await getCalculation(ctx, id);
  await audit({ action: "calculation.export", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "calculation", resourceId: id, metadata: { format }, meta: ctx.meta });
  const base = c.title.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "calculo";
  if (format === "csv") return { body: Buffer.from(toCsv(c.result), "utf8"), type: "text/csv; charset=utf-8", name: `${base}.csv` };
  if (format === "txt") return { body: Buffer.from(memorial(c.result), "utf8"), type: "text/plain; charset=utf-8", name: `${base}-memoria.txt` };
  return { body: await toXlsx(c.result), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: `${base}.xlsx` };
}

// ---------------- índices do escritório ----------------
export async function listSeriesRows(ctx: TenantContext, series: string, limit = 60) {
  assertCan(ctx, "cases:read");
  const rows = await db.monetaryIndex.findMany({ where: { series, OR: [{ organizationId: null }, { organizationId: ctx.organizationId }] }, orderBy: { month: "desc" }, take: limit, select: { month: true, ratePercent: true, source: true, organizationId: true } });
  return rows.map((r) => ({ month: r.month.toISOString().slice(0, 7), value: r.ratePercent.toString(), source: r.source, own: r.organizationId !== null }));
}

export async function setCalcIndex(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "finance:manage");
  const v = indexInputSchema.parse(raw);
  const value = v.value.trim().replace(",", ".");
  const n = fx(value);
  if (n === null || value.length > 18 || n > 999_999n * 10n ** 12n) throw new ValidationError("Valor inválido. Exemplo: 0,46", { value: ["Valor inválido. Exemplo: 0,46"] });
  if (v.series === "REAJUSTE_INSS" && v.month.slice(5) !== "01") throw new ValidationError("O reajuste do INSS vale a partir de janeiro: use o mês 01 do ano.");
  const where = { organizationId: ctx.organizationId, series: v.series, month: ymdToDate(`${v.month}-01`) };
  const dec = n / 10n ** 6n; // 6 casas do banco
  const text = `${dec / 10n ** 6n}.${(dec % 10n ** 6n).toString().padStart(6, "0")}`;
  const found = await db.monetaryIndex.findFirst({ where, select: { id: true } });
  if (found) await db.monetaryIndex.update({ where: { id: found.id }, data: { ratePercent: text, source: "MANUAL" } });
  else await db.monetaryIndex.create({ data: { ...where, ratePercent: text, source: "MANUAL" } });
  await audit({ action: "finance.index_manual", organizationId: ctx.organizationId, userId: ctx.userId, metadata: { series: v.series, month: v.month, value: text }, meta: ctx.meta });
}

/** Copia para o escritório as tabelas que já vinham nas regras (TJSP e reajuste do INSS). Não sobrescreve nada lançado à mão. */
export async function loadOfficeTables(ctx: TenantContext) {
  assertCan(ctx, "finance:manage");
  let added = 0;
  const put = async (series: string, month: string, value: string, source: string) => {
    const where = { organizationId: ctx.organizationId, series, month: ymdToDate(`${month}-01`) };
    if (await db.monetaryIndex.findFirst({ where, select: { id: true } })) return;
    await db.monetaryIndex.create({ data: { ...where, ratePercent: value, source } });
    added++;
  };
  for (const [m, v] of Object.entries(TJSP_FACTORS)) await put("TJSP", m, v, TJSP_SOURCE);
  for (const [y, v] of Object.entries(REAJUSTE_INSS)) await put("REAJUSTE_INSS", `${y}-01`, v, REAJUSTE_SOURCE);
  await audit({ action: "calculation.load_tables", organizationId: ctx.organizationId, userId: ctx.userId, metadata: { added }, meta: ctx.meta });
  if (added === 0) throw new ConflictError("As tabelas já estavam carregadas.");
  return { added };
}
