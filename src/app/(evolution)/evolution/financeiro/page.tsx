import Link from "next/link";
import { Wallet, Receipt, TrendingDown } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { EmptyState } from "@/components/evolution/empty-state";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";

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

  const ind = await getIndicators(ctx).catch(() => null);
  const overdueReceivable = ind?.overdue.find((r) => r.key === "finance-receivable");
  const overduePayable = ind?.overdue.find((r) => r.key === "finance-payable");

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overdueReceivable && (
          <StatCard icon={TrendingDown} label="A receber em atraso" value={overdueReceivable.count} detail={overdueReceivable.amount ? `R$ ${overdueReceivable.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : undefined} color="#ef4444" />
        )}
        {overduePayable && (
          <StatCard icon={Receipt} label="A pagar em atraso" value={overduePayable.count} detail={overduePayable.amount ? `R$ ${overduePayable.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : undefined} color="#f59e0b" />
        )}
      </div>

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
