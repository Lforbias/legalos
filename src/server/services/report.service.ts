import { db } from "@/lib/db/client";
import { addDays, dateToYmd, isYmd, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { utcToZoned, zonedToUtc } from "@/lib/dates/zoned";
import { fromCents, toCents } from "@/lib/finance/money";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { ValidationError } from "@/lib/permissions/check";
import type { CsvCell } from "@/lib/reports/csv";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { caseVisibility } from "./case.service";
import { visibility as noticeVisibility } from "./notice.service";

/** Relatórios e BI: tudo calculado do banco, restrito ao escritório, às permissões do módulo de origem e ao sigilo dos processos. */

export const REPORT_TYPES = {
  prazos: { label: "Prazos", permission: "deadlines:read" },
  intimacoes: { label: "Intimações", permission: "inbox:read" },
  processos: { label: "Processos", permission: "cases:read" },
  equipe: { label: "Equipe", permission: "productivity:read" },
  financeiro: { label: "Financeiro", permission: "finance:read" },
} as const satisfies Record<string, { label: string; permission: PermissionKey }>;
export type ReportType = keyof typeof REPORT_TYPES;
export const REPORT_TYPE_LIST = Object.keys(REPORT_TYPES) as ReportType[];

/** Limite de linhas lidas por relatório; acima disso o relatório avisa que está incompleto em vez de mentir. */
const ROW_CAP = 50_000;
const MAX_SPAN_DAYS = 366;

export function availableReports(ctx: TenantContext): ReportType[] {
  if (!can(ctx, "reports:read")) return [];
  return REPORT_TYPE_LIST.filter((t) => can(ctx, REPORT_TYPES[t].permission));
}

function assertReport(ctx: TenantContext, type: ReportType) {
  assertCan(ctx, "reports:read");
  assertCan(ctx, REPORT_TYPES[type].permission);
}

export type Period = { from: string; to: string; fromInstant: Date; toInstant: Date; today: string; months: string[]; tz: string };

function diffDays(a: string, b: string) {
  return Math.round((ymdToDate(b).getTime() - ymdToDate(a).getTime()) / 86_400_000);
}

/** Período em datas locais do escritório (padrão: últimos 90 dias, até 366). Os limites de instantes usam o fuso do escritório. */
export function resolvePeriod(ctx: TenantContext, from?: string | null, to?: string | null): Period {
  const today = todayYmd(ctx.timezone);
  const t = to || today;
  const f = from || addDays(t, -89);
  if (!isYmd(f) || !isYmd(t)) throw new ValidationError("Período inválido.", { from: ["Use datas válidas (AAAA-MM-DD)."] });
  if (f > t) throw new ValidationError("A data inicial é depois da final.", { from: ["A data inicial deve ser anterior à final."] });
  if (diffDays(f, t) > MAX_SPAN_DAYS) throw new ValidationError("Período longo demais.", { from: [`Escolha no máximo ${MAX_SPAN_DAYS} dias.`] });
  const months: string[] = [];
  let cur = `${f.slice(0, 7)}-01`;
  while (cur.slice(0, 7) <= t.slice(0, 7)) {
    months.push(cur.slice(0, 7));
    const [y, m] = cur.split("-").map(Number) as [number, number];
    cur = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  }
  return { from: f, to: t, fromInstant: zonedToUtc(f, "00:00", ctx.timezone), toInstant: zonedToUtc(addDays(t, 1), "00:00", ctx.timezone), today, months, tz: ctx.timezone };
}

const ymdOfInstant = (d: Date, tz: string) => utcToZoned(d, tz).ymd;
const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

export type Table = { headers: string[]; rows: CsvCell[][] };
export type Result<T> = { data: T; table: Table; truncated: boolean };

// ---------------------------------------------------------------- Prazos

export type DeadlinesReport = {
  total: number;
  onTime: number;
  late: number;
  openOverdue: number;
  openOnSchedule: number;
  draft: number;
  canceled: number;
  complianceRate: number | null;
  byMonth: { month: string; total: number; onTime: number; missed: number }[];
  byResponsible: { name: string; total: number; onTime: number; late: number; openOverdue: number }[];
};

export async function deadlinesReport(ctx: TenantContext, p: Period): Promise<Result<DeadlinesReport>> {
  assertReport(ctx, "prazos");
  const rows = await db.deadline.findMany({
    where: { organizationId: ctx.organizationId, dueDate: { gte: ymdToDate(p.from), lte: ymdToDate(p.to) }, case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } },
    orderBy: { dueDate: "asc" },
    take: ROW_CAP + 1,
    select: { title: true, status: true, dueDate: true, fulfilledAt: true, responsibleId: true, case: { select: { number: true, title: true } } },
  });
  const truncated = rows.length > ROW_CAP;
  const list = truncated ? rows.slice(0, ROW_CAP) : rows;
  const names = new Map(
    (await db.user.findMany({ where: { id: { in: [...new Set(list.map((r) => r.responsibleId).filter((x): x is string => !!x))] }, memberships: { some: { organizationId: ctx.organizationId } } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const out: DeadlinesReport = { total: 0, onTime: 0, late: 0, openOverdue: 0, openOnSchedule: 0, draft: 0, canceled: 0, complianceRate: null, byMonth: p.months.map((month) => ({ month, total: 0, onTime: 0, missed: 0 })), byResponsible: [] };
  const resp = new Map<string, DeadlinesReport["byResponsible"][number]>();
  const table: Table = { headers: ["Prazo", "Processo", "Título do processo", "Vencimento", "Situação", "Cumprido em", "Resultado", "Responsável"], rows: [] };
  for (const r of list) {
    const due = dateToYmd(r.dueDate);
    let result = "";
    if (r.status === "CANCELED") {
      out.canceled++;
      result = "Cancelado";
    } else {
      out.total++;
      const bucket = out.byMonth.find((m) => m.month === due.slice(0, 7));
      if (bucket) bucket.total++;
      const who = r.responsibleId ? (names.get(r.responsibleId) ?? "Sem responsável") : "Sem responsável";
      const e = resp.get(who) ?? { name: who, total: 0, onTime: 0, late: 0, openOverdue: 0 };
      e.total++;
      if (r.status === "FULFILLED") {
        const doneOn = r.fulfilledAt ? ymdOfInstant(r.fulfilledAt, p.tz) : due;
        if (doneOn <= due) {
          out.onTime++;
          e.onTime++;
          if (bucket) bucket.onTime++;
          result = "No prazo";
        } else {
          out.late++;
          e.late++;
          if (bucket) bucket.missed++;
          result = "Fora do prazo";
        }
      } else if (due < p.today) {
        out.openOverdue++;
        e.openOverdue++;
        if (bucket) bucket.missed++;
        result = "Vencido sem cumprimento";
      } else {
        out.openOnSchedule++;
        result = "Em aberto";
      }
      if (r.status === "DRAFT") out.draft++;
      resp.set(who, e);
    }
    table.rows.push([r.title, r.case.number ?? "", r.case.title, due, r.status, r.fulfilledAt ? ymdOfInstant(r.fulfilledAt, p.tz) : "", result, ""]);
  }
  out.complianceRate = pct(out.onTime, out.onTime + out.late + out.openOverdue);
  out.byResponsible = [...resp.values()].sort((a, b) => b.total - a.total);
  // responsável na tabela (segunda passada, sem refazer consulta)
  list.forEach((r, i) => {
    table.rows[i]![7] = r.responsibleId ? (names.get(r.responsibleId) ?? "") : "";
  });
  return { data: out, table, truncated };
}

// ---------------------------------------------------------------- Intimações

export type NoticesReport = {
  total: number;
  byStatus: Record<string, number>;
  byKind: { kind: string; count: number }[];
  bySource: { source: string; count: number }[];
  processed: number;
  avgHoursToProcess: number | null;
  medianHoursToProcess: number | null;
  stale: number;
  byMonth: { month: string; received: number; processed: number }[];
};

export async function noticesReport(ctx: TenantContext, p: Period): Promise<Result<NoticesReport>> {
  assertReport(ctx, "intimacoes");
  const rows = await db.courtNotice.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null, receivedAt: { gte: ymdToDate(p.from), lte: ymdToDate(p.to) } }, noticeVisibility(ctx)] },
    orderBy: { receivedAt: "asc" },
    take: ROW_CAP + 1,
    select: { title: true, kind: true, source: true, status: true, receivedAt: true, createdAt: true, processedAt: true, caseNumber: true, court: true },
  });
  const truncated = rows.length > ROW_CAP;
  const list = truncated ? rows.slice(0, ROW_CAP) : rows;
  const staleLimit = addDays(p.today, -3);
  const out: NoticesReport = { total: list.length, byStatus: { NEW: 0, DISTRIBUTED: 0, PROCESSED: 0, DISCARDED: 0 }, byKind: [], bySource: [], processed: 0, avgHoursToProcess: null, medianHoursToProcess: null, stale: 0, byMonth: p.months.map((month) => ({ month, received: 0, processed: 0 })) };
  const kinds = new Map<string, number>();
  const sources = new Map<string, number>();
  const hours: number[] = [];
  const table: Table = { headers: ["Título", "Tipo", "Origem", "Situação", "Recebida em", "Tratada em", "Horas até tratar", "Processo", "Órgão"], rows: [] };
  for (const r of list) {
    out.byStatus[r.status] = (out.byStatus[r.status] ?? 0) + 1;
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
    sources.set(r.source, (sources.get(r.source) ?? 0) + 1);
    const rec = dateToYmd(r.receivedAt);
    const bucket = out.byMonth.find((m) => m.month === rec.slice(0, 7));
    if (bucket) bucket.received++;
    let h: number | null = null;
    if (r.status === "PROCESSED" && r.processedAt) {
      out.processed++;
      if (bucket) bucket.processed++;
      h = Math.max(0, (r.processedAt.getTime() - r.createdAt.getTime()) / 3_600_000);
      hours.push(h);
    }
    if (r.status === "NEW" && rec <= staleLimit) out.stale++;
    table.rows.push([r.title, r.kind, r.source, r.status, rec, r.processedAt ? ymdOfInstant(r.processedAt, p.tz) : "", h === null ? "" : Math.round(h * 10) / 10, r.caseNumber ?? "", r.court ?? ""]);
  }
  if (hours.length) {
    const sorted = [...hours].sort((a, b) => a - b);
    out.avgHoursToProcess = Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10;
    const mid = Math.floor(sorted.length / 2);
    out.medianHoursToProcess = Math.round((sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
  }
  out.byKind = [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
  out.bySource = [...sources].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
  return { data: out, table, truncated };
}

// ---------------------------------------------------------------- Processos

export type CasesReport = {
  visibleTotal: number;
  byStatus: Record<string, number>;
  byArea: { label: string; count: number }[];
  byCourt: { label: string; count: number }[];
  createdInPeriod: number;
  byMonthCreated: { month: string; count: number }[];
};

export async function casesReport(ctx: TenantContext, p: Period): Promise<Result<CasesReport>> {
  assertReport(ctx, "processos");
  const rows = await db.case.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] },
    orderBy: { createdAt: "asc" },
    take: ROW_CAP + 1,
    select: { number: true, title: true, area: true, court: true, status: true, createdAt: true },
  });
  const truncated = rows.length > ROW_CAP;
  const list = truncated ? rows.slice(0, ROW_CAP) : rows;
  const out: CasesReport = { visibleTotal: list.length, byStatus: { ACTIVE: 0, SUSPENDED: 0, ARCHIVED: 0, CLOSED: 0 }, byArea: [], byCourt: [], createdInPeriod: 0, byMonthCreated: p.months.map((month) => ({ month, count: 0 })) };
  const areas = new Map<string, number>();
  const courts = new Map<string, number>();
  const table: Table = { headers: ["Número", "Título", "Área", "Órgão", "Situação", "Cadastrado em"], rows: [] };
  for (const r of list) {
    out.byStatus[r.status] = (out.byStatus[r.status] ?? 0) + 1;
    const a = r.area?.trim() || "Sem área";
    areas.set(a, (areas.get(a) ?? 0) + 1);
    const c = r.court?.trim() || "Sem órgão";
    courts.set(c, (courts.get(c) ?? 0) + 1);
    const created = ymdOfInstant(r.createdAt, p.tz);
    if (created >= p.from && created <= p.to) {
      out.createdInPeriod++;
      const b = out.byMonthCreated.find((m) => m.month === created.slice(0, 7));
      if (b) b.count++;
    }
    table.rows.push([r.number ?? "", r.title, r.area ?? "", r.court ?? "", r.status, created]);
  }
  const top = (m: Map<string, number>, n: number) => [...m].map(([label, count]) => ({ label, count })).sort((x, y) => y.count - x.count || x.label.localeCompare(y.label)).slice(0, n);
  out.byArea = top(areas, 10);
  out.byCourt = top(courts, 10);
  return { data: out, table, truncated };
}

// ---------------------------------------------------------------- Equipe

export type TeamReport = {
  members: { name: string; tasksDone: number; tasksOpen: number; tasksOverdue: number; hours: number; deadlinesFulfilled: number }[];
  totals: { tasksDone: number; hours: number; deadlinesFulfilled: number };
};

export async function teamReport(ctx: TenantContext, p: Period): Promise<Result<TeamReport>> {
  assertReport(ctx, "equipe");
  const org = ctx.organizationId;
  const members = await db.membership.findMany({ where: { organizationId: org, status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } });
  const taskVis = { OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] };
  const [done, open, minutes, dls] = await Promise.all([
    db.task.groupBy({ by: ["assigneeId"], where: { AND: [{ organizationId: org, deletedAt: null, status: "DONE", completedAt: { gte: p.fromInstant, lt: p.toInstant } }, taskVis] }, _count: { _all: true } }),
    db.task.findMany({ where: { AND: [{ organizationId: org, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } }, taskVis] }, select: { assigneeId: true, dueDate: true }, take: ROW_CAP }),
    db.timeEntry.groupBy({ by: ["userId"], where: { AND: [{ organizationId: org, deletedAt: null, entryDate: { gte: ymdToDate(p.from), lte: ymdToDate(p.to) } }] }, _sum: { minutes: true } }),
    db.deadline.groupBy({ by: ["responsibleId"], where: { organizationId: org, status: "FULFILLED", fulfilledAt: { gte: p.fromInstant, lt: p.toInstant }, case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }, _count: { _all: true } }),
  ]);
  const today = ymdToDate(p.today);
  const rows = members.map((m) => {
    const mine = open.filter((t) => t.assigneeId === m.userId);
    return {
      name: m.user.name,
      tasksDone: done.find((d) => d.assigneeId === m.userId)?._count._all ?? 0,
      tasksOpen: mine.length,
      tasksOverdue: mine.filter((t) => t.dueDate && t.dueDate < today).length,
      hours: Math.round(((minutes.find((x) => x.userId === m.userId)?._sum.minutes ?? 0) / 60) * 10) / 10,
      deadlinesFulfilled: dls.find((d) => d.responsibleId === m.userId)?._count._all ?? 0,
    };
  });
  rows.sort((a, b) => b.tasksDone + b.deadlinesFulfilled - (a.tasksDone + a.deadlinesFulfilled) || a.name.localeCompare(b.name));
  const data: TeamReport = { members: rows, totals: { tasksDone: rows.reduce((a, r) => a + r.tasksDone, 0), hours: Math.round(rows.reduce((a, r) => a + r.hours, 0) * 10) / 10, deadlinesFulfilled: rows.reduce((a, r) => a + r.deadlinesFulfilled, 0) } };
  return { data, table: { headers: ["Membro", "Tarefas concluídas", "Tarefas abertas hoje", "Tarefas atrasadas hoje", "Horas registradas", "Prazos cumpridos"], rows: rows.map((r) => [r.name, r.tasksDone, r.tasksOpen, r.tasksOverdue, r.hours, r.deadlinesFulfilled]) }, truncated: open.length >= ROW_CAP };
}

// ---------------------------------------------------------------- Financeiro

export type FinanceReport = {
  received: string;
  paid: string;
  net: string;
  receivableOpen: string;
  receivableOverdue: string;
  payableOverdue: string;
  aging: { label: string; amount: string }[];
  byMonth: { month: string; received: string; paid: string }[];
  incomeByCategory: { label: string; amount: string }[];
  expenseByCategory: { label: string; amount: string }[];
  topClients: { label: string; amount: string }[];
};

async function hiddenCaseIds(ctx: TenantContext): Promise<string[]> {
  if (can(ctx, "organization:manage")) return [];
  const rows = await db.case.findMany({ where: { organizationId: ctx.organizationId, confidential: true, members: { none: { userId: ctx.userId } } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function financeReport(ctx: TenantContext, p: Period): Promise<Result<FinanceReport>> {
  assertReport(ctx, "financeiro");
  const org = ctx.organizationId;
  const hidden = await hiddenCaseIds(ctx);
  const caseOk = hidden.length ? { OR: [{ caseId: null }, { caseId: { notIn: hidden } }] } : {};
  const payments = await db.financePayment.findMany({
    where: { organizationId: org, reversedAt: null, paidOn: { gte: ymdToDate(p.from), lte: ymdToDate(p.to) }, entry: caseOk },
    orderBy: { paidOn: "asc" },
    take: ROW_CAP + 1,
    select: { amount: true, paidOn: true, entry: { select: { kind: true, description: true, categoryId: true, clientId: true } } },
  });
  const truncated = payments.length > ROW_CAP;
  const list = truncated ? payments.slice(0, ROW_CAP) : payments;
  const catNames = new Map((await db.financeCategory.findMany({ where: { organizationId: org }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const clientNames = new Map((await db.client.findMany({ where: { id: { in: [...new Set(list.map((x) => x.entry.clientId).filter((i): i is string => !!i))] }, organizationId: org }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const cents = (d: { toString(): string }) => toCents(d.toString()) ?? 0n;
  let received = 0n;
  let paid = 0n;
  const byMonth = new Map(p.months.map((m) => [m, { r: 0n, p: 0n }]));
  const inCat = new Map<string, bigint>();
  const outCat = new Map<string, bigint>();
  const cli = new Map<string, bigint>();
  const table: Table = { headers: ["Data", "Tipo", "Descrição", "Categoria", "Cliente", "Valor"], rows: [] };
  for (const x of list) {
    const c = cents(x.amount);
    const inflow = x.entry.kind === "RECEIVABLE";
    const month = dateToYmd(x.paidOn).slice(0, 7);
    const b = byMonth.get(month);
    const cat = (x.entry.categoryId && catNames.get(x.entry.categoryId)) || "Sem categoria";
    if (inflow) {
      received += c;
      if (b) b.r += c;
      inCat.set(cat, (inCat.get(cat) ?? 0n) + c);
      const name = x.entry.clientId ? (clientNames.get(x.entry.clientId) ?? "Sem cliente") : "Sem cliente";
      cli.set(name, (cli.get(name) ?? 0n) + c);
    } else {
      paid += c;
      if (b) b.p += c;
      outCat.set(cat, (outCat.get(cat) ?? 0n) + c);
    }
    table.rows.push([dateToYmd(x.paidOn), inflow ? "Recebimento" : "Pagamento", x.entry.description, cat, x.entry.clientId ? (clientNames.get(x.entry.clientId) ?? "") : "", Number(fromCents(inflow ? c : -c))]);
  }
  // posição atual (hoje), não depende do período
  const open = await db.financeEntry.findMany({
    where: { organizationId: org, status: { in: ["OPEN", "PARTIAL"] }, canceledAt: null, ...caseOk },
    select: { kind: true, amount: true, paidAmount: true, dueDate: true },
    take: ROW_CAP,
  });
  let recvOpen = 0n;
  let recvOver = 0n;
  let payOver = 0n;
  const buckets = [0n, 0n, 0n, 0n];
  const today = ymdToDate(p.today);
  for (const e of open) {
    const rem = cents(e.amount) - cents(e.paidAmount);
    const overdueDays = Math.floor((today.getTime() - e.dueDate.getTime()) / 86_400_000);
    if (e.kind === "RECEIVABLE") {
      recvOpen += rem;
      if (overdueDays > 0) {
        recvOver += rem;
        buckets[overdueDays <= 30 ? 0 : overdueDays <= 60 ? 1 : overdueDays <= 90 ? 2 : 3]! += rem;
      }
    } else if (overdueDays > 0) payOver += rem;
  }
  const top = (m: Map<string, bigint>, n: number) => [...m].map(([label, v]) => ({ label, amount: fromCents(v) })).sort((a, b) => Number((toCents(b.amount) ?? 0n) - (toCents(a.amount) ?? 0n))).slice(0, n);
  const data: FinanceReport = {
    received: fromCents(received),
    paid: fromCents(paid),
    net: fromCents(received - paid),
    receivableOpen: fromCents(recvOpen),
    receivableOverdue: fromCents(recvOver),
    payableOverdue: fromCents(payOver),
    aging: [
      { label: "1 a 30 dias", amount: fromCents(buckets[0]!) },
      { label: "31 a 60 dias", amount: fromCents(buckets[1]!) },
      { label: "61 a 90 dias", amount: fromCents(buckets[2]!) },
      { label: "Mais de 90 dias", amount: fromCents(buckets[3]!) },
    ],
    byMonth: [...byMonth].map(([month, v]) => ({ month, received: fromCents(v.r), paid: fromCents(v.p) })),
    incomeByCategory: top(inCat, 8),
    expenseByCategory: top(outCat, 8),
    topClients: top(cli, 10),
  };
  return { data, table, truncated };
}

// ---------------------------------------------------------------- Exportação

export async function exportReport(ctx: TenantContext, type: ReportType, p: Period): Promise<{ table: Table; truncated: boolean }> {
  assertReport(ctx, type);
  const r =
    type === "prazos" ? await deadlinesReport(ctx, p)
    : type === "intimacoes" ? await noticesReport(ctx, p)
    : type === "processos" ? await casesReport(ctx, p)
    : type === "equipe" ? await teamReport(ctx, p)
    : await financeReport(ctx, p);
  await audit({ action: "report.export", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "report", metadata: { type, from: p.from, to: p.to, rows: r.table.rows.length }, meta: ctx.meta });
  return { table: r.table, truncated: r.truncated };
}
