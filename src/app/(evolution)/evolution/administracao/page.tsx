import Link from "next/link";
import { BarChart3, UserSquare2, Plug, Zap, Settings, LayoutDashboard, Hourglass, Wallet, FolderOpen } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { DataError } from "@/components/evolution/data-error";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";
import { availableReports } from "@/server/services/report.service";
import { formatMoneyBR } from "@/lib/validation/money";

export default async function AdministracaoPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.administracao;
  const [ind, indErr] = await getIndicators(ctx).then((result) => [result, false] as const).catch(() => [null, true] as const);
  const reportsAvailable = availableReports(ctx).length > 0;
  const overdueTasks = ind?.overdue.find((row) => row.key === "tasks");
  const overdueDeadlines = ind?.overdue.find((row) => row.key === "deadlines");
  const overdueReceivable = ind?.overdue.find((row) => row.key === "receivable");
  const overduePayable = ind?.overdue.find((row) => row.key === "payable");

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      {indErr && <DataError message="Não foi possível carregar alguns indicadores de gestão" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ind?.movement && <StatCard icon={FolderOpen} label="Processos ativos" value={ind.movement.total} color={dept.color} />}
        {overdueTasks && <StatCard icon={Zap} label="Tarefas atrasadas" value={overdueTasks.count} color="#ef4444" />}
        {overdueDeadlines && <StatCard icon={Hourglass} label="Prazos vencidos" value={overdueDeadlines.count} color="#f59e0b" />}
        {overdueReceivable && <StatCard icon={Wallet} label="A receber vencido" value={formatMoneyBR(overdueReceivable.amount ?? 0)} color="#10b981" />}
        {overduePayable && <StatCard icon={Wallet} label="A pagar vencido" value={formatMoneyBR(overduePayable.amount ?? 0)} color="#ef4444" />}
      </div>

      <h2 className="mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/indicadores" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
          <BarChart3 className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium group-hover:text-primary">Indicadores</p>
            <p className="text-[12px] text-muted">Atrasados, movimentação e evolução da carteira</p>
          </div>
        </Link>
        {can(ctx, "productivity:read") && (
          <Link href="/equipe" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <UserSquare2 className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Equipe</p>
              <p className="text-[12px] text-muted">Carga de trabalho e produtividade</p>
            </div>
          </Link>
        )}
        {can(ctx, "integrations:manage") && (
          <Link href="/integracoes" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Plug className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Integrações</p>
              <p className="text-[12px] text-muted">API, Google e integrações compartilhadas</p>
            </div>
          </Link>
        )}
        {can(ctx, "workflows:manage") && (
          <Link href="/automacoes" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Zap className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Automações</p>
              <p className="text-[12px] text-muted">Regras de distribuição e criação de tarefas</p>
            </div>
          </Link>
        )}
        {reportsAvailable && (
          <Link href="/relatorios" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <LayoutDashboard className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Relatórios</p>
              <p className="text-[12px] text-muted">Exportações e BI por período</p>
            </div>
          </Link>
        )}
        <Link href="/configuracoes" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
          <Settings className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium group-hover:text-primary">Configurações</p>
            <p className="text-[12px] text-muted">Escritório, equipe, perfis e auditoria</p>
          </div>
        </Link>
      </div>
    </>
  );
}
