import { db } from "@/lib/db/client";
import { isYmd, todayYmd } from "@/lib/dates/ymd";
import { fromCents, toCents } from "@/lib/finance/money";
import { ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";

type Row = { cat: string | null; m: number; kind: string; total: string };
export type AnnualLine = { categoryId: string | null; name: string; realized: string[]; expected: string[]; realizedTotal: string; expectedTotal: string };
export type AnnualKind = { lines: AnnualLine[]; realized: string[]; expected: string[]; realizedTotal: string; expectedTotal: string };

const zeros = () => Array.from({ length: 12 }, () => 0n);
const sumArr = (a: bigint[]) => a.reduce((x, y) => x + y, 0n);

/**
 * Fluxo de caixa ANUAL por categoria. Realizado = baixas efetivas (não estornadas) no mês da baixa;
 * Previsto = saldo em aberto no mês do vencimento. Separado em a receber e a pagar.
 */
export async function annualCashflow(ctx: TenantContext, yearInput?: number) {
  assertCan(ctx, "finance:read");
  const year = yearInput ?? Number(todayYmd(ctx.timezone).slice(0, 4));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ValidationError("Ano inválido.");
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const org = ctx.organizationId;
  const realized = await db.$queryRaw<Row[]>`
    SELECT e.category_id::text AS cat, EXTRACT(MONTH FROM p.paid_on)::int AS m, e.kind::text AS kind, SUM(p.amount)::text AS total
    FROM finance_payments p JOIN finance_entries e ON e.id = p.entry_id AND e.organization_id = p.organization_id
    WHERE p.organization_id = ${org}::uuid AND p.reversed_at IS NULL AND p.paid_on >= ${from}::date AND p.paid_on < ${to}::date
    GROUP BY 1, 2, 3`;
  const expected = await db.$queryRaw<Row[]>`
    SELECT category_id::text AS cat, EXTRACT(MONTH FROM due_date)::int AS m, kind::text AS kind, SUM(amount - paid_amount)::text AS total
    FROM finance_entries
    WHERE organization_id = ${org}::uuid AND status IN ('OPEN', 'PARTIAL') AND due_date >= ${from}::date AND due_date < ${to}::date
    GROUP BY 1, 2, 3`;
  const cats = await db.financeCategory.findMany({ where: { organizationId: org }, select: { id: true, name: true } });
  const names = new Map(cats.map((c) => [c.id, c.name]));

  const build = (kind: string): AnnualKind => {
    const keys = new Set<string>();
    for (const r of [...realized, ...expected]) if (r.kind === kind) keys.add(r.cat ?? "");
    const lines = [...keys].map((k) => {
      const re = zeros();
      const ex = zeros();
      for (const r of realized) if (r.kind === kind && (r.cat ?? "") === k) re[r.m - 1] = toCents(r.total) ?? 0n;
      for (const r of expected) if (r.kind === kind && (r.cat ?? "") === k) ex[r.m - 1] = toCents(r.total) ?? 0n;
      return { k, re, ex };
    });
    lines.sort((a, b) => (a.k === "" ? 1 : b.k === "" ? -1 : (names.get(a.k) ?? "").localeCompare(names.get(b.k) ?? "", "pt-BR")));
    const totRe = zeros();
    const totEx = zeros();
    for (const l of lines) for (let i = 0; i < 12; i++) { totRe[i]! += l.re[i]!; totEx[i]! += l.ex[i]!; }
    const f = (a: bigint[]) => a.map((x) => fromCents(x));
    return {
      lines: lines.map((l) => ({ categoryId: l.k || null, name: l.k ? (names.get(l.k) ?? "Categoria removida") : "Sem categoria", realized: f(l.re), expected: f(l.ex), realizedTotal: fromCents(sumArr(l.re)), expectedTotal: fromCents(sumArr(l.ex)) })),
      realized: f(totRe),
      expected: f(totEx),
      realizedTotal: fromCents(sumArr(totRe)),
      expectedTotal: fromCents(sumArr(totEx)),
    };
  };
  const receivable = build("RECEIVABLE");
  const payable = build("PAYABLE");
  const net = (a: string[], b: string[]) => a.map((x, i) => fromCents((toCents(x) ?? 0n) - (toCents(b[i]!) ?? 0n)));
  return {
    year,
    receivable,
    payable,
    netRealized: net(receivable.realized, payable.realized),
    netExpected: net(receivable.expected, payable.expected),
  };
}

/**
 * Saldo do dia: por conta, saldo ao FIM do dia (saldo inicial + baixas até a data), o que entrou e saiu no dia,
 * e o que vence no dia (a receber / a pagar em aberto).
 */
export async function dayBalance(ctx: TenantContext, date?: string) {
  assertCan(ctx, "finance:read");
  const day = date ?? todayYmd(ctx.timezone);
  if (!isYmd(day)) throw new ValidationError("Data inválida.");
  const org = ctx.organizationId;
  const accounts = await db.$queryRaw<{ id: string; name: string; active: boolean; balance: string; inflow: string; outflow: string }[]>`
    SELECT a.id::text AS id, a.name, a.active,
      (a.initial_balance + COALESCE(SUM(CASE WHEN p.id IS NULL OR p.paid_on > ${day}::date THEN 0 WHEN e.kind = 'RECEIVABLE' THEN p.amount ELSE -p.amount END), 0))::text AS balance,
      COALESCE(SUM(CASE WHEN p.paid_on = ${day}::date AND e.kind = 'RECEIVABLE' THEN p.amount ELSE 0 END), 0)::text AS inflow,
      COALESCE(SUM(CASE WHEN p.paid_on = ${day}::date AND e.kind = 'PAYABLE' THEN p.amount ELSE 0 END), 0)::text AS outflow
    FROM finance_accounts a
    LEFT JOIN finance_payments p ON p.account_id = a.id AND p.organization_id = a.organization_id AND p.reversed_at IS NULL
    LEFT JOIN finance_entries e ON e.id = p.entry_id AND e.organization_id = p.organization_id
    WHERE a.organization_id = ${org}::uuid AND a.deleted_at IS NULL
    GROUP BY a.id ORDER BY a.name`;
  const due = await db.$queryRaw<{ kind: string; total: string; n: number }[]>`
    SELECT kind::text AS kind, COALESCE(SUM(amount - paid_amount), 0)::text AS total, COUNT(*)::int AS n
    FROM finance_entries WHERE organization_id = ${org}::uuid AND status IN ('OPEN', 'PARTIAL') AND due_date = ${day}::date GROUP BY 1`;
  const total = (k: "balance" | "inflow" | "outflow") => fromCents(accounts.reduce((a, r) => a + (toCents(r[k]) ?? 0n), 0n));
  const d = (k: string) => due.find((x) => x.kind === k);
  return {
    date: day,
    accounts,
    totalBalance: total("balance"),
    totalInflow: total("inflow"),
    totalOutflow: total("outflow"),
    dueReceivable: { total: d("RECEIVABLE")?.total ?? "0.00", count: d("RECEIVABLE")?.n ?? 0 },
    duePayable: { total: d("PAYABLE")?.total ?? "0.00", count: d("PAYABLE")?.n ?? 0 },
  };
}
