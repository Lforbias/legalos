import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { addDays, dateToYmd, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { can, type TenantContext } from "@/server/context";
import { birthdaysWithin } from "@/lib/birthdays";
import { caseVisibility } from "./case.service";

/**
 * 2.0-F2: indicadores e central de alertas. Tudo é CALCULADO na hora a partir dos dados reais do escritório (sem tabela nova).
 * Cada bloco só aparece (e só consulta) se o perfil tem a permissão de leitura do módulo; processos confidenciais seguem a regra
 * de visibilidade de sempre. Nada aqui altera dados.
 */

const OPEN_TASK: ("TODO" | "IN_PROGRESS" | "WAITING")[] = ["TODO", "IN_PROGRESS", "WAITING"];
const OPEN_DL: ("DRAFT" | "VALIDATED")[] = ["DRAFT", "VALIDATED"];
const OPEN_FIN: ("OPEN" | "PARTIAL")[] = ["OPEN", "PARTIAL"];
const DAY = 86_400_000;
const num = (v: { toString(): string } | null | undefined) => Number(v?.toString() ?? 0);

function scope(ctx: TenantContext) {
  const org = ctx.organizationId;
  const today = todayYmd(ctx.timezone);
  const todayD = ymdToDate(today);
  const caseOk = { AND: [{ deletedAt: null }, caseVisibility(ctx)] } satisfies Prisma.CaseWhereInput;
  const caseWhere = { AND: [{ organizationId: org, deletedAt: null }, caseVisibility(ctx)] } satisfies Prisma.CaseWhereInput;
  const withCaseOrNone = { OR: [{ caseId: null }, { case: caseOk }] };
  return {
    org, today, todayD, caseOk, caseWhere,
    tasks: { organizationId: org, deletedAt: null, status: { in: OPEN_TASK }, ...withCaseOrNone } satisfies Prisma.TaskWhereInput,
    deadlines: { organizationId: org, status: { in: OPEN_DL }, case: caseOk } satisfies Prisma.DeadlineWhereInput,
    notices: { organizationId: org, deletedAt: null, ...withCaseOrNone } satisfies Prisma.CourtNoticeWhereInput,
    finance: { organizationId: org, status: { in: OPEN_FIN }, canceledAt: null } satisfies Prisma.FinanceEntryWhereInput,
  };
}

// ───────────────────────── Indicadores ─────────────────────────

export type OverdueRow = { key: string; label: string; count: number; href: string; amount?: number };
export type Indicators = {
  today: string;
  overdue: OverdueRow[];
  movement: { total: number; windows: { days: number; withMovement: number; without: number }[] } | null;
  evolution: { months: { label: string; cases: number; clients: number | null; casesTotal: number }[]; byStatus: { status: string; count: number }[] } | null;
  perClient: { id: string; name: string; cases: number }[] | null;
  mine: { tasksOpen: number | null; tasksOverdue: number | null; deadlinesOpen: number | null; deadlinesOverdue: number | null; deadlinesNext7: number | null; notices: number | null; cases: number | null };
};

export const MOVEMENT_WINDOWS = [7, 30, 60, 90] as const;
const MONTHS = 12;

function monthKey(d: Date, tz: string): string {
  return todayYmd(tz, d).slice(0, 7);
}
function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const t = (y * 12 + (m - 1)) - (n - 1 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (k: string) => `${MONTH_NAMES[Number(k.slice(5)) - 1]}/${k.slice(2, 4)}`;

export async function getIndicators(ctx: TenantContext): Promise<Indicators> {
  const s = scope(ctx);
  const canCases = can(ctx, "cases:read");
  const canClients = can(ctx, "clients:read");
  const canTk = can(ctx, "tasks:read");
  const canDl = can(ctx, "deadlines:read");
  const canFin = can(ctx, "finance:read");
  const canInbox = can(ctx, "inbox:read");
  const in7 = ymdToDate(addDays(s.today, 7));

  const overdue: OverdueRow[] = [];
  const [tk, dl, recv, pay, nt] = await Promise.all([
    canTk ? db.task.count({ where: { ...s.tasks, dueDate: { lt: s.todayD } } }) : null,
    canDl ? db.deadline.count({ where: { ...s.deadlines, dueDate: { lt: s.todayD } } }) : null,
    canFin ? db.financeEntry.aggregate({ where: { ...s.finance, kind: "RECEIVABLE", dueDate: { lt: s.todayD } }, _count: { _all: true }, _sum: { amount: true, paidAmount: true } }) : null,
    canFin ? db.financeEntry.aggregate({ where: { ...s.finance, kind: "PAYABLE", dueDate: { lt: s.todayD } }, _count: { _all: true }, _sum: { amount: true, paidAmount: true } }) : null,
    canInbox ? db.courtNotice.count({ where: { ...s.notices, status: "NEW", receivedAt: { lt: new Date(s.todayD.getTime() - 2 * DAY) } } }) : null,
  ]);
  if (tk !== null) overdue.push({ key: "tasks", label: "Tarefas atrasadas", count: tk, href: "/alertas?aba=tarefas" });
  if (dl !== null) overdue.push({ key: "deadlines", label: "Prazos vencidos e não cumpridos", count: dl, href: "/alertas?aba=prazos" });
  if (nt !== null) overdue.push({ key: "notices", label: "Publicações novas há mais de 2 dias", count: nt, href: "/alertas?aba=publicacoes" });
  if (recv) overdue.push({ key: "receivable", label: "Honorários a receber vencidos", count: recv._count._all, amount: num(recv._sum.amount) - num(recv._sum.paidAmount), href: "/alertas?aba=financeiro" });
  if (pay) overdue.push({ key: "payable", label: "Contas a pagar vencidas", count: pay._count._all, amount: num(pay._sum.amount) - num(pay._sum.paidAmount), href: "/alertas?aba=financeiro" });

  let movement: Indicators["movement"] = null;
  let evolution: Indicators["evolution"] = null;
  let perClient: Indicators["perClient"] = null;
  if (canCases) {
    const active = { ...s.caseWhere, AND: [...s.caseWhere.AND, { status: "ACTIVE" as const }] };
    const [total, ...withMov] = await Promise.all([
      db.case.count({ where: active }),
      ...MOVEMENT_WINDOWS.map((d) => db.case.count({ where: { AND: [active, { events: { some: { occurredAt: { gte: new Date(Date.now() - d * DAY) } } } }] } })),
    ]);
    movement = { total, windows: MOVEMENT_WINDOWS.map((d, i) => ({ days: d, withMovement: withMov[i]!, without: total - withMov[i]! })) };

    const months = lastMonths(s.today, MONTHS);
    const startD = ymdToDate(`${months[0]}-01`);
    const [before, inWindow, clientsInWindow, statusGroups] = await Promise.all([
      db.case.count({ where: { AND: [s.caseWhere, { createdAt: { lt: startD } }] } }),
      db.case.findMany({ where: { AND: [s.caseWhere, { createdAt: { gte: startD } }] }, select: { createdAt: true }, take: 20_000 }),
      canClients ? db.client.findMany({ where: { organizationId: s.org, deletedAt: null, createdAt: { gte: startD } }, select: { createdAt: true }, take: 20_000 }) : null,
      db.case.groupBy({ by: ["status"], where: s.caseWhere, _count: { _all: true } }),
    ]);
    const byCase = new Map<string, number>();
    for (const c of inWindow) byCase.set(monthKey(c.createdAt, ctx.timezone), (byCase.get(monthKey(c.createdAt, ctx.timezone)) ?? 0) + 1);
    const byClient = new Map<string, number>();
    for (const c of clientsInWindow ?? []) byClient.set(monthKey(c.createdAt, ctx.timezone), (byClient.get(monthKey(c.createdAt, ctx.timezone)) ?? 0) + 1);
    let acc = before;
    evolution = {
      months: months.map((k) => { acc += byCase.get(k) ?? 0; return { label: monthLabel(k), cases: byCase.get(k) ?? 0, clients: clientsInWindow ? (byClient.get(k) ?? 0) : null, casesTotal: acc }; }),
      byStatus: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
    };

    if (canClients) {
      const g = await db.caseParty.groupBy({ by: ["clientId"], where: { organizationId: s.org, clientId: { not: null }, case: { AND: [s.caseOk, { status: "ACTIVE" }] } }, _count: { caseId: true }, orderBy: { _count: { caseId: "desc" } }, take: 10 });
      const ids = g.map((x) => x.clientId!).filter(Boolean);
      const names = ids.length ? await db.client.findMany({ where: { id: { in: ids }, organizationId: s.org }, select: { id: true, name: true } }) : [];
      const nm = new Map(names.map((n) => [n.id, n.name]));
      perClient = g.map((x) => ({ id: x.clientId!, name: nm.get(x.clientId!) ?? "Cliente", cases: x._count.caseId }));
    }
  }

  const me = ctx.userId;
  const [mTk, mTkOver, mDl, mDlOver, mDl7, mNt, mCases] = await Promise.all([
    canTk ? db.task.count({ where: { ...s.tasks, assigneeId: me } }) : null,
    canTk ? db.task.count({ where: { ...s.tasks, assigneeId: me, dueDate: { lt: s.todayD } } }) : null,
    canDl ? db.deadline.count({ where: { ...s.deadlines, responsibleId: me } }) : null,
    canDl ? db.deadline.count({ where: { ...s.deadlines, responsibleId: me, dueDate: { lt: s.todayD } } }) : null,
    canDl ? db.deadline.count({ where: { ...s.deadlines, responsibleId: me, dueDate: { gte: s.todayD, lte: in7 } } }) : null,
    canInbox ? db.courtNotice.count({ where: { ...s.notices, status: "DISTRIBUTED", assigneeId: me } }) : null,
    canCases ? db.case.count({ where: { AND: [s.caseWhere, { status: "ACTIVE" }, { members: { some: { userId: me } } }] } }) : null,
  ]);
  return { today: s.today, overdue, movement, evolution, perClient, mine: { tasksOpen: mTk, tasksOverdue: mTkOver, deadlinesOpen: mDl, deadlinesOverdue: mDlOver, deadlinesNext7: mDl7, notices: mNt, cases: mCases } };
}

// ───────────────────────── Central de alertas ─────────────────────────

export const ALERT_TABS = [
  { key: "publicacoes", label: "Publicações" },
  { key: "andamentos", label: "Andamentos" },
  { key: "processos", label: "Processos" },
  { key: "tarefas", label: "Tarefas" },
  { key: "prazos", label: "Prazos" },
  { key: "agenda", label: "Agenda" },
  { key: "financeiro", label: "Financeiro" },
  { key: "integracao", label: "Integrações" },
  { key: "aniversarios", label: "Aniversariantes" },
] as const;
export type AlertTab = (typeof ALERT_TABS)[number]["key"];
export const isAlertTab = (v: string): v is AlertTab => ALERT_TABS.some((t) => t.key === v);

export type AlertItem = { id: string; title: string; sub: string | null; when: Date | string | null; whenKind: "date" | "ymd" | "datetime"; href: string; action: string; tone: "danger" | "warning" | "info" | "neutral"; badge?: string };
const LIMIT = 50;
const STALE_DAYS = 60;

function tabPermission(ctx: TenantContext, tab: AlertTab): boolean {
  switch (tab) {
    case "publicacoes": return can(ctx, "inbox:read");
    case "andamentos": case "processos": return can(ctx, "cases:read");
    case "tarefas": return can(ctx, "tasks:read");
    case "prazos": case "agenda": return can(ctx, "deadlines:read");
    case "financeiro": return can(ctx, "finance:read");
    case "integracao": return can(ctx, "integrations:manage") || can(ctx, "certificates:manage") || can(ctx, "whatsapp:manage");
    case "aniversarios": return can(ctx, "clients:read");
  }
}
export const availableAlertTabs = (ctx: TenantContext) => ALERT_TABS.filter((t) => tabPermission(ctx, t.key));

type Parts = { items: () => Promise<AlertItem[]> };

function tabParts(ctx: TenantContext, tab: AlertTab): Parts {
  const s = scope(ctx);
  const in7 = ymdToDate(addDays(s.today, 7));
  switch (tab) {
    case "publicacoes": {
      const where = { ...s.notices, status: "NEW" as const };
      return {
        items: async () => (await db.courtNotice.findMany({ where, orderBy: { receivedAt: "desc" }, take: LIMIT, select: { id: true, title: true, caseNumber: true, court: true, receivedAt: true } }))
          .map((n) => ({ id: n.id, title: n.title, sub: [n.caseNumber, n.court].filter(Boolean).join(" · ") || null, when: n.receivedAt, whenKind: "ymd" as const, href: `/caixa-de-entrada/${n.id}`, action: "Tratar", tone: "warning" as const, badge: "Nova" })),
      };
    }
    case "andamentos": {
      const where = { organizationId: s.org, occurredAt: { gte: new Date(Date.now() - 7 * DAY) }, case: s.caseOk };
      return {
        items: async () => (await db.caseEvent.findMany({ where, orderBy: { occurredAt: "desc" }, take: LIMIT, select: { id: true, title: true, occurredAt: true, case: { select: { id: true, title: true, number: true } } } }))
          .map((e) => ({ id: e.id, title: e.title, sub: `${e.case.title}${e.case.number ? ` · ${e.case.number}` : ""}`, when: e.occurredAt, whenKind: "datetime" as const, href: `/processos/${e.case.id}`, action: "Abrir processo", tone: "info" as const })),
      };
    }
    case "processos": {
      const stale = new Date(Date.now() - STALE_DAYS * DAY);
      const where = { AND: [s.caseWhere, { status: "ACTIVE" as const }, { createdAt: { lt: stale } }, { events: { none: { occurredAt: { gte: stale } } } }] };
      return {
        items: async () => (await db.case.findMany({ where, orderBy: { createdAt: "asc" }, take: LIMIT, select: { id: true, title: true, number: true, events: { orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } } } }))
          .map((c) => ({ id: c.id, title: c.title, sub: c.number, when: c.events[0]?.occurredAt ?? null, whenKind: "date" as const, href: `/processos/${c.id}`, action: "Abrir processo", tone: "warning" as const, badge: c.events[0] ? "Sem movimento" : "Nunca teve movimento" })),
      };
    }
    case "tarefas": {
      const where = { ...s.tasks, dueDate: { lt: new Date(s.todayD.getTime() + DAY) } };
      return {
        items: async () => (await db.task.findMany({ where, orderBy: { dueDate: "asc" }, take: LIMIT, select: { id: true, title: true, dueDate: true, case: { select: { title: true } } } }))
          .map((t) => ({ id: t.id, title: t.title, sub: t.case?.title ?? null, when: t.dueDate, whenKind: "ymd" as const, href: `/tarefas/${t.id}`, action: "Abrir tarefa", tone: (t.dueDate && t.dueDate < s.todayD ? "danger" : "warning") as "danger" | "warning", badge: t.dueDate && t.dueDate < s.todayD ? "Atrasada" : "Vence hoje" })),
      };
    }
    case "prazos": {
      const where = { ...s.deadlines, dueDate: { lte: in7 } };
      return {
        items: async () => (await db.deadline.findMany({ where, orderBy: { dueDate: "asc" }, take: LIMIT, select: { id: true, title: true, dueDate: true, status: true, case: { select: { title: true } } } }))
          .map((d) => ({ id: d.id, title: d.title, sub: d.case.title, when: d.dueDate, whenKind: "ymd" as const, href: `/prazos/${d.id}`, action: "Abrir prazo", tone: (d.dueDate < s.todayD ? "danger" : "warning") as "danger" | "warning", badge: d.dueDate < s.todayD ? "Vencido" : d.status === "DRAFT" ? "Rascunho" : "Próximos 7 dias" })),
      };
    }
    case "agenda": {
      const end = new Date(s.todayD.getTime() + 3 * DAY);
      const where = { organizationId: s.org, deletedAt: null, startsAt: { gte: s.todayD, lt: end }, ...{ OR: [{ caseId: null }, { case: s.caseOk }] } };
      return {
        items: async () => (await db.agendaEvent.findMany({ where, orderBy: { startsAt: "asc" }, take: LIMIT, select: { id: true, title: true, startsAt: true, allDay: true, location: true, case: { select: { title: true } } } }))
          .map((e) => ({ id: e.id, title: e.title, sub: [e.case?.title, e.location].filter(Boolean).join(" · ") || null, when: e.startsAt, whenKind: (e.allDay ? "date" : "datetime") as "date" | "datetime", href: "/agenda", action: "Ver na agenda", tone: "info" as const })),
      };
    }
    case "financeiro": {
      const where = { ...s.finance, dueDate: { lte: new Date(s.todayD.getTime() + 3 * DAY) } };
      return {
        items: async () => (await db.financeEntry.findMany({ where, orderBy: { dueDate: "asc" }, take: LIMIT, select: { id: true, description: true, kind: true, dueDate: true, amount: true, paidAmount: true } }))
          .map((f) => ({ id: f.id, title: f.description, sub: `${f.kind === "RECEIVABLE" ? "A receber" : "A pagar"} · saldo ${(num(f.amount) - num(f.paidAmount)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, when: f.dueDate, whenKind: "ymd" as const, href: `/financeiro/lancamentos/${f.id}`, action: "Abrir lançamento", tone: (f.dueDate < s.todayD ? "danger" : "warning") as "danger" | "warning", badge: f.dueDate < s.todayD ? "Vencido" : "Vence em breve" })),
      };
    }
    case "integracao":
      return { items: async () => [] };
    case "aniversarios":
      return { items: async () => [] };
  }
}

async function integrationItems(ctx: TenantContext): Promise<AlertItem[]> {
  const org = ctx.organizationId;
  const out: AlertItem[] = [];
  const now = Date.now();
  if (can(ctx, "integrations:manage") || can(ctx, "inbox:read")) {
    const mons = await db.djenMonitor.findMany({ where: { organizationId: org, enabled: true }, select: { id: true, label: true, lastStatus: true, lastSyncAt: true, lastMessage: true } });
    for (const m of mons) {
      const stale = !m.lastSyncAt || now - m.lastSyncAt.getTime() > 36 * 3_600_000;
      if (m.lastStatus === "ERROR") out.push({ id: `djen-${m.id}`, title: `Captura do DJEN com erro: ${m.label}`, sub: m.lastMessage, when: m.lastSyncAt, whenKind: "datetime", href: "/caixa-de-entrada", action: "Ver capturas", tone: "danger", badge: "Erro" });
      else if (stale) out.push({ id: `djen-${m.id}`, title: `Captura do DJEN parada: ${m.label}`, sub: m.lastSyncAt ? "Sem verificação há mais de 36 horas." : "Nunca foi verificada.", when: m.lastSyncAt, whenKind: "datetime", href: "/caixa-de-entrada", action: "Ver capturas", tone: "warning", badge: "Parada" });
    }
  }
  if (can(ctx, "certificates:manage")) {
    const certs = await db.certificate.findMany({ where: { organizationId: org, revokedAt: null, notAfter: { lte: new Date(now + 30 * DAY) } }, orderBy: { notAfter: "asc" }, select: { id: true, label: true, notAfter: true } });
    for (const c of certs) out.push({ id: `cert-${c.id}`, title: c.notAfter.getTime() <= now ? `Certificado vencido: ${c.label}` : `Certificado vence em breve: ${c.label}`, sub: null, when: c.notAfter, whenKind: "date", href: "/certificados", action: "Ver certificados", tone: c.notAfter.getTime() <= now ? "danger" : "warning", badge: c.notAfter.getTime() <= now ? "Vencido" : "Vence em 30 dias" });
  }
  if (can(ctx, "whatsapp:manage")) {
    const acc = await db.whatsappAccount.findUnique({ where: { organizationId: org }, select: { enabled: true, lastStatus: true, lastMessage: true, lastCheckAt: true } });
    if (acc && acc.enabled && acc.lastStatus && acc.lastStatus !== "OK") out.push({ id: "wa-acc", title: "O número do WhatsApp está com problema", sub: acc.lastMessage, when: acc.lastCheckAt, whenKind: "datetime", href: "/atendimento/configuracoes", action: "Abrir configurações", tone: "danger", badge: "Atenção" });
  }
  return out;
}

async function tabCount(ctx: TenantContext, tab: AlertTab): Promise<number> {
  const s = scope(ctx);
  const in7 = ymdToDate(addDays(s.today, 7));
  switch (tab) {
    case "publicacoes": return db.courtNotice.count({ where: { ...s.notices, status: "NEW" } });
    case "andamentos": return db.caseEvent.count({ where: { organizationId: s.org, occurredAt: { gte: new Date(Date.now() - 7 * DAY) }, case: s.caseOk } });
    case "processos": {
      const stale = new Date(Date.now() - STALE_DAYS * DAY);
      return db.case.count({ where: { AND: [s.caseWhere, { status: "ACTIVE" }, { createdAt: { lt: stale } }, { events: { none: { occurredAt: { gte: stale } } } }] } });
    }
    case "tarefas": return db.task.count({ where: { ...s.tasks, dueDate: { lt: new Date(s.todayD.getTime() + DAY) } } });
    case "prazos": return db.deadline.count({ where: { ...s.deadlines, dueDate: { lte: in7 } } });
    case "agenda": return db.agendaEvent.count({ where: { organizationId: s.org, deletedAt: null, startsAt: { gte: s.todayD, lt: new Date(s.todayD.getTime() + 3 * DAY) }, OR: [{ caseId: null }, { case: s.caseOk }] } });
    case "financeiro": return db.financeEntry.count({ where: { ...s.finance, dueDate: { lte: new Date(s.todayD.getTime() + 3 * DAY) } } });
    case "integracao": return (await integrationItems(ctx)).length;
    case "aniversarios": return (await birthdayRows(ctx)).length;
  }
}

export const BIRTHDAY_DAYS = 7;

/** Clientes (pessoas físicas ativas) que fazem aniversário hoje ou nos próximos 7 dias, no fuso do escritório. */
export async function birthdayRows(ctx: TenantContext) {
  if (!can(ctx, "clients:read")) return [];
  const today = todayYmd(ctx.timezone);
  const rows = await db.client.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, status: "ACTIVE", type: "PERSON", birthDate: { not: null } }, select: { id: true, name: true, birthDate: true }, take: 20000 });
  return birthdaysWithin(rows.map((r) => ({ id: r.id, name: r.name, birthDate: dateToYmd(r.birthDate!) })), today, BIRTHDAY_DAYS);
}

/** Contadores de todas as abas que o perfil pode ver. */
export async function alertCounts(ctx: TenantContext): Promise<Record<string, number>> {
  const tabs = availableAlertTabs(ctx);
  const counts = await Promise.all(tabs.map((t) => tabCount(ctx, t.key)));
  return Object.fromEntries(tabs.map((t, i) => [t.key, counts[i]!]));
}

/** Itens de uma aba (no máximo 50). Sem permissão: lista vazia. */
export async function alertItems(ctx: TenantContext, tab: AlertTab): Promise<AlertItem[]> {
  if (!tabPermission(ctx, tab)) return [];
  if (tab === "integracao") return integrationItems(ctx);
  if (tab === "aniversarios") return (await birthdayRows(ctx)).slice(0, LIMIT).map((b) => ({ id: b.id, title: b.name, sub: b.daysLeft === 0 ? `Faz ${b.turns} anos hoje` : `Faz ${b.turns} anos em ${b.daysLeft} dia(s)`, when: b.date, whenKind: "ymd" as const, href: `/clientes/${b.id}`, action: "Abrir cliente", tone: (b.daysLeft === 0 ? "info" : "neutral") as "info" | "neutral", badge: b.daysLeft === 0 ? "Hoje" : undefined }));
  return tabParts(ctx, tab).items();
}
