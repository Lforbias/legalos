import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatYmd, todayYmd } from "@/lib/dates/ymd";
import { formatMoneyBR } from "@/lib/validation/money";
import { FinanceNav } from "@/modules/finance/finance-nav";
import { can } from "@/server/context";
import { annualCashflow, dayBalance } from "@/server/services/finance-report.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Fluxo anual" };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Block = { lines: { name: string; realized: string[]; expected: string[]; realizedTotal: string; expectedTotal: string }[]; realized: string[]; expected: string[]; realizedTotal: string; expectedTotal: string };

function Table({ title, block }: { title: string; block: Block }) {
  return (
    <Card className="mt-4">
      <CardHeader title={title} description="Em cada categoria: realizado (baixas) acima, previsto (em aberto por vencimento) abaixo." />
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Categoria</th>
              {MONTHS.map((m) => <th key={m} className="px-1.5 py-2 text-right font-medium">{m}</th>)}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {block.lines.length === 0 ? <tr><td colSpan={14} className="p-6 text-center text-sm text-muted">Sem movimentação neste ano.</td></tr> : null}
            {block.lines.map((l) => (
              <tr key={l.name}>
                <td className="px-3 py-1.5 align-top">{l.name}</td>
                {l.realized.map((v, i) => (
                  <td key={i} className="px-1.5 py-1.5 text-right align-top">
                    <div>{v === "0.00" ? "—" : formatMoneyBR(v)}</div>
                    <div className="text-muted">{l.expected[i] === "0.00" ? "" : formatMoneyBR(l.expected[i]!)}</div>
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right align-top font-medium">
                  <div>{formatMoneyBR(l.realizedTotal)}</div>
                  <div className="font-normal text-muted">{formatMoneyBR(l.expectedTotal)}</div>
                </td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="px-3 py-1.5 align-top">Total</td>
              {block.realized.map((v, i) => (
                <td key={i} className="px-1.5 py-1.5 text-right align-top">
                  <div>{formatMoneyBR(v)}</div>
                  <div className="font-normal text-muted">{formatMoneyBR(block.expected[i]!)}</div>
                </td>
              ))}
              <td className="px-3 py-1.5 text-right align-top">
                <div>{formatMoneyBR(block.realizedTotal)}</div>
                <div className="font-normal text-muted">{formatMoneyBR(block.expectedTotal)}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function AnnualPage({ searchParams }: { searchParams: Promise<{ ano?: string; dia?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const sp = await searchParams;
  const thisYear = Number(todayYmd(ctx.timezone).slice(0, 4));
  const year = /^\d{4}$/.test(sp.ano ?? "") ? Number(sp.ano) : thisYear;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia : undefined;
  const [flow, today] = await Promise.all([annualCashflow(ctx, year), dayBalance(ctx, day)]);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Fluxo de caixa anual" description="Realizado e previsto por categoria, mês a mês, e o saldo de cada conta no dia." />
      <FinanceNav current="anual" />
      <div className="mb-3 flex items-center gap-3 text-sm">
        <Link className="text-primary-text hover:underline" href={`/financeiro/anual?ano=${year - 1}`}>← {year - 1}</Link>
        <strong>{year}</strong>
        <Link className="text-primary-text hover:underline" href={`/financeiro/anual?ano=${year + 1}`}>{year + 1} →</Link>
      </div>

      <Card>
        <CardHeader title={`Saldo do dia — ${formatYmd(today.date)}`} description="Saldo ao fim do dia, o que entrou e saiu, e o que vence no dia." />
        <CardBody>
          <form className="mb-3 flex items-center gap-2 text-sm" action="/financeiro/anual">
            <input type="hidden" name="ano" value={year} />
            <label htmlFor="dia" className="text-muted">Ver outro dia</label>
            <input id="dia" name="dia" type="date" defaultValue={today.date} className="rounded-md border border-border bg-surface px-2 py-1" />
            <button className="rounded-md border border-border px-2 py-1 hover:bg-surface-2">Ver</button>
          </form>
          <ul className="divide-y divide-border text-sm">
            {today.accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>{a.name}</span>
                <span className="tabular-nums"><span className="mr-3 text-xs text-muted">+{formatMoneyBR(a.inflow)} / −{formatMoneyBR(a.outflow)}</span><strong>{formatMoneyBR(a.balance)}</strong></span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 py-2 font-medium"><span>Total das contas</span><span className="tabular-nums" data-testid="day-total">{formatMoneyBR(today.totalBalance)}</span></li>
          </ul>
          <p className="mt-3 text-xs text-muted">Vence no dia: a receber {formatMoneyBR(today.dueReceivable.total)} ({today.dueReceivable.count}) · a pagar {formatMoneyBR(today.duePayable.total)} ({today.duePayable.count})</p>
        </CardBody>
      </Card>

      <Table title="A receber" block={flow.receivable} />
      <Table title="A pagar" block={flow.payable} />

      <Card className="mt-4">
        <CardHeader title="Resultado do mês (receber − pagar)" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-muted"><tr><th className="px-3 py-2 font-medium" />{MONTHS.map((m) => <th key={m} className="px-1.5 py-2 text-right font-medium">{m}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              <tr><td className="px-3 py-1.5">Realizado</td>{flow.netRealized.map((v, i) => <td key={i} className="px-1.5 py-1.5 text-right">{formatMoneyBR(v)}</td>)}</tr>
              <tr><td className="px-3 py-1.5">Previsto</td>{flow.netExpected.map((v, i) => <td key={i} className="px-1.5 py-1.5 text-right">{formatMoneyBR(v)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
