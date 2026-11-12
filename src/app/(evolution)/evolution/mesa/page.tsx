import Link from "next/link";
import { CheckSquare, CalendarClock, Clock, FolderKanban } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";
import { DataError } from "@/components/evolution/data-error";

export default async function MesaPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.mesa;
  const [ind, indErr] = await getIndicators(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const);

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title="Minha Mesa" description="Suas tarefas, prazos e compromissos pessoais." />

      {indErr && <DataError message="Não foi possível carregar os indicadores pessoais" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ind?.mine.tasksOpen != null && <StatCard icon={CheckSquare} label="Tarefas pendentes" value={ind.mine.tasksOpen} detail={ind.mine.tasksOverdue ? `${ind.mine.tasksOverdue} em atraso` : undefined} color="#6366f1" />}
        {ind?.mine.deadlinesOpen != null && <StatCard icon={Clock} label="Prazos abertos" value={ind.mine.deadlinesOpen} detail={ind.mine.deadlinesNext7 ? `${ind.mine.deadlinesNext7} nos próximos 7 dias` : undefined} color="#f59e0b" />}
        {ind?.mine.cases != null && <StatCard icon={FolderKanban} label="Processos ativos" value={ind.mine.cases} color="#10b981" />}
      </div>

      <h2 className="mt-8 mb-4 text-base font-semibold">Acesso rápido</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {can(ctx, "tasks:read") && (
          <Link href="/tarefas" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <CheckSquare className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Minhas Tarefas</p>
              <p className="text-[12px] text-muted">Kanban, filtros e comentários</p>
            </div>
          </Link>
        )}
        {can(ctx, "deadlines:read") && (
          <Link href="/agenda" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <CalendarClock className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Agenda</p>
              <p className="text-[12px] text-muted">Compromissos e prazos no calendário</p>
            </div>
          </Link>
        )}
        {can(ctx, "tasks:read") && (
          <Link href="/gestao" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <FolderKanban className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Gestão</p>
              <p className="text-[12px] text-muted">Quadros Kanban do escritório</p>
            </div>
          </Link>
        )}
      </div>
    </>
  );
}
