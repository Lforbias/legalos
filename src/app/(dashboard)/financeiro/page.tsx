import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { fromCents, toCents } from "@/lib/finance/money";
import { formatYmd } from "@/lib/dates/ymd";
import { formatMoneyBR } from "@/lib/validation/money";
import { FinanceNav } from "@/modules/finance/finance-nav";
import { can } from "@/server/context";
import { accountBalances, cashflow, financeSummary, listEntries } from "@/server/services/finance.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Financeiro" };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

function Stat({ label, value, tone, id }: { label: string; value: string; tone?: "danger" | "success"; id: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-muted">{label}</p>
        <p data-testid={id} className={`mt-1 text-xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""}`}>{formatMoneyBR(value)}</p>
      </CardBody>
    </Card>
  );
}

export default async function FinancePage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const [summary, balances, flow, upcoming] = await Promise.all([
    financeSummary(ctx),
    accountBalances(ctx),
    cashflow(ctx, 6),
    listEntries(ctx, { status: "aberto" }),
  ]);
  const next = upcoming.items.slice(0, 8);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Financeiro"
        description="Contas a receber e a pagar, baixas e fluxo de caixa. Valores em reais, calculados sem arredondamento de ponto flutuante."
        actions={can(ctx, "finance:write") ? <Link href="/financeiro/lancamentos/novo" className={bv({})}><Plus className="h-4 w-4" aria-hidden /> Novo lançamento</Link> : undefined}
      />
      <FinanceNav current="visao" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat id="stat-receivable-open" label="A receber (em aberto)" value={summary.receivableOpen} />
        <Stat id="stat-receivable-overdue" label="A receber vencido" value={summary.receivableOverdue} tone={summary.receivableOverdue !== "0.00" ? "danger" : undefined} />
        <Stat id="stat-received-month" label="Recebido no mês" value={summary.receivedThisMonth} tone="success" />
        <Stat id="stat-payable-open" label="A pagar (em aberto)" value={summary.payableOpen} />
        <Stat id="stat-payable-overdue" label="A pagar vencido" value={summary.payableOverdue} tone={summary.payableOverdue !== "0.00" ? "danger" : undefined} />
        <Stat id="stat-paid-month" label="Pago no mês" value={summary.paidThisMonth} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Fluxo de caixa" description="Realizado = baixas efetivas no mês. Previsto = saldo em aberto com vencimento no mês." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Mês</th>
                  <th className="px-2 py-2 text-right font-medium">Recebido</th>
                  <th className="px-2 py-2 text-right font-medium">Pago</th>
                  <th className="px-2 py-2 text-right font-medium">A receber</th>
                  <th className="px-4 py-2 text-right font-medium">A pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {(flow.overdueIn !== "0.00" || flow.overdueOut !== "0.00") && (
                  <tr className="text-danger">
                    <td className="px-4 py-2">Vencidos anteriores</td>
                    <td className="px-2 py-2 text-right">—</td>
                    <td className="px-2 py-2 text-right">—</td>
                    <td className="px-2 py-2 text-right">{formatMoneyBR(flow.overdueIn)}</td>
                    <td className="px-4 py-2 text-right">{formatMoneyBR(flow.overdueOut)}</td>
                  </tr>
                )}
                {flow.months.map((m) => (
                  <tr key={m.month}>
                    <td className="px-4 py-2">{monthLabel(m.month)}</td>
                    <td className="px-2 py-2 text-right">{formatMoneyBR(m.realizedIn)}</td>
                    <td className="px-2 py-2 text-right">{formatMoneyBR(m.realizedOut)}</td>
                    <td className="px-2 py-2 text-right">{formatMoneyBR(m.expectedIn)}</td>
                    <td className="px-4 py-2 text-right">{formatMoneyBR(m.expectedOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Saldo das contas" />
          {balances.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nenhuma conta cadastrada. <Link className="text-primary-text hover:underline" href="/financeiro/cadastros">Cadastre a primeira</Link>.</p>
          ) : (
            <ul className="divide-y divide-border">
              {balances.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>{b.name} {!b.active ? <Badge tone="warning">inativa</Badge> : null}</span>
                  <span className="font-medium tabular-nums" data-testid={`balance-${b.name}`}>{formatMoneyBR(b.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Próximos vencimentos" action={<Link href="/financeiro/lancamentos" className="text-xs text-primary-text hover:underline">Ver todos</Link>} />
        {next.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nada em aberto.</p> : null}
        <ul className="divide-y divide-border">
          {next.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href={`/financeiro/lancamentos/${e.id}`} className="font-medium text-primary-text hover:underline">{e.description}</Link>
                <p className="text-xs text-muted">{e.kind === "RECEIVABLE" ? "A receber" : "A pagar"} · vence {formatYmd(e.dueDate.toISOString().slice(0, 10))}{e.clientName ? ` · ${e.clientName}` : ""}</p>
              </div>
              <span className="tabular-nums">{formatMoneyBR(fromCents((toCents(e.amount.toString()) ?? 0n) - (toCents(e.paidAmount.toString()) ?? 0n)))}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
