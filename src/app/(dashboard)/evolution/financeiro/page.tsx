import Link from "next/link";
import { Wallet, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { EmptyState } from "@/components/evolution/empty-state";
import { DataError } from "@/components/evolution/data-error";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";
import { cashflow, financeSummary } from "@/server/services/finance.service";
import { formatMoneyBR } from "@/lib/validation/money";
import { todayYmd } from "@/lib/dates/ymd";

export default async function FinanceiroPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.financeiro;
  const hasFinance = can(ctx, "finance:read");

  if (!hasFinance) {
    return (
      <>
        <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />
        <EmptyState icon={Wallet} title="Sem acesso ao Financeiro" description="Seu perfil não tem permissão para acessar o financeiro. Solicite acesso ao administrador." />
      </>
    );
  }

  const [[ind, indErr], [summary, summaryErr], [flow, flowErr]] = await Promise.all([
    getIndicators(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const),
    financeSummary(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const),
    cashflow(ctx, 3).then((r) => [r, false] as const).catch(() => [null, true] as const),
  ]);
  const overdueReceivable = ind?.overdue.find((r) => r.key === "receivable");
  const overduePayable = ind?.overdue.find((r) => r.key === "payable");
  const currentMonth = todayYmd(ctx.timezone).slice(0, 7);
  const upcomingFlow = flow?.months.filter((month) => month.month >= currentMonth).slice(0, 3) ?? [];

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      {(indErr || summaryErr || flowErr) && <DataError message="Não foi possível carregar alguns indicadores financeiros" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="A receber em aberto" value={summaryErr ? "—" : formatMoneyBR(summary?.receivableOpen)} detail={summary ? `Atrasado: ${formatMoneyBR(summary.receivableOverdue)}` : undefined} color="#10b981" />
        <StatCard icon={Receipt} label="A pagar em aberto" value={summaryErr ? "—" : formatMoneyBR(summary?.payableOpen)} detail={summary ? `Atrasado: ${formatMoneyBR(summary.payableOverdue)}` : undefined} color="#f59e0b" />
        <StatCard icon={TrendingUp} label="Recebido neste mês" value={summaryErr ? "—" : formatMoneyBR(summary?.receivedThisMonth)} color={dept.color} />
        <StatCard icon={Wallet} label="Pago neste mês" value={summaryErr ? "—" : formatMoneyBR(summary?.paidThisMonth)} color="#64748b" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overdueReceivable && (
          <StatCard icon={TrendingDown} label="Lançamentos a receber vencidos" value={indErr ? "—" : overdueReceivable.count} detail={overdueReceivable.amount !== undefined ? formatMoneyBR(overdueReceivable.amount) : undefined} color="#ef4444" />
        )}
        {overduePayable && (
          <StatCard icon={Receipt} label="Lançamentos a pagar vencidos" value={indErr ? "—" : overduePayable.count} detail={overduePayable.amount !== undefined ? formatMoneyBR(overduePayable.amount) : undefined} color="#ef4444" />
        )}
      </div>

      <section className="mt-8">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Fluxo de caixa previsto</h2>
          <p className="mt-1 text-sm text-muted">Previsões usam saldos em aberto; realizado usa baixas não estornadas.</p>
        </div>
        {upcomingFlow.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingFlow.map((month) => (
              <article key={month.month} className="rounded-xl border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">{month.month.slice(5, 7)}/{month.month.slice(0, 4)}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted">Entrada prevista</dt><dd className="text-right font-medium">{formatMoneyBR(month.expectedIn)}</dd>
                  <dt className="text-muted">Saída prevista</dt><dd className="text-right font-medium">{formatMoneyBR(month.expectedOut)}</dd>
                  <dt className="text-muted">Recebido</dt><dd className="text-right">{formatMoneyBR(month.realizedIn)}</dd>
                  <dt className="text-muted">Pago</dt><dd className="text-right">{formatMoneyBR(month.realizedOut)}</dd>
                </dl>
              </article>
            ))}
          </div>
        ) : flowErr ? null : <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">Nenhum período de fluxo disponível.</p>}
      </section>

      <h2 className="mt-8 mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/financeiro" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
          <Wallet className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium group-hover:text-primary">Lançamentos</p>
            <p className="text-[12px] text-muted">Contas a pagar e receber, baixas e estornos</p>
          </div>
        </Link>
      </div>
    </>
  );
}
