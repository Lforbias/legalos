import Link from "next/link";
import { FolderOpen, Hourglass, FileText, Calculator, Bot } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { EmptyState } from "@/components/evolution/empty-state";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";
import { listCases } from "@/server/services/case.service";

export default async function JuridicoPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.juridico;
  const ind = await getIndicators(ctx).catch(() => null);
  const hasCases = can(ctx, "cases:read");
  const cases = hasCases ? await listCases(ctx, { page: 1 }).catch(() => ({ rows: [], total: 0 })) : { rows: [], total: 0 };

  if (!hasCases) {
    return (
      <>
        <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />
        <EmptyState icon={FolderOpen} title="Sem acesso ao Jurídico" description="Seu perfil não tem permissão para acessar processos. Solicite acesso ao administrador." />
      </>
    );
  }

  const overdueProcesses = ind?.overdue.find((r) => r.key === "cases-stale");
  const overdueTasks = ind?.overdue.find((r) => r.key === "tasks");
  const overdueDeadlines = ind?.overdue.find((r) => r.key === "deadlines");

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FolderOpen} label="Processos ativos" value={cases.total} color={dept.color} />
        {overdueDeadlines && <StatCard icon={Hourglass} label="Prazos em atraso" value={overdueDeadlines.count} color="#ef4444" />}
        {overdueTasks && <StatCard icon={FolderOpen} label="Tarefas em atraso" value={overdueTasks.count} color="#f59e0b" />}
        {overdueProcesses && <StatCard icon={FolderOpen} label="Processos parados" value={overdueProcesses.count} detail="sem movimentação recente" color="#64748b" />}
      </div>

      <h2 className="mt-8 mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/processos" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
          <FolderOpen className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium group-hover:text-primary">Processos</p>
            <p className="text-[12px] text-muted">Cadastro, partes, linha do tempo e carteira</p>
          </div>
        </Link>
        {can(ctx, "deadlines:read") && (
          <Link href="/prazos" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Hourglass className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Prazos</p>
              <p className="text-[12px] text-muted">Cadastro manual e calculadora auxiliar</p>
            </div>
          </Link>
        )}
        {can(ctx, "documents:read") && (
          <Link href="/documentos" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <FileText className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Documentos</p>
              <p className="text-[12px] text-muted">Repositório com versões e modelos</p>
            </div>
          </Link>
        )}
        <Link href="/calculos" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
          <Calculator className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium group-hover:text-primary">Cálculos</p>
            <p className="text-[12px] text-muted">Atrasados JF, débitos TJSP, verbas trabalhistas</p>
          </div>
        </Link>
        {can(ctx, "ai:use") && (
          <Link href="/ia" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Bot className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">IA do processo</p>
              <p className="text-[12px] text-muted">Perguntas sobre o processo com fontes citadas</p>
            </div>
          </Link>
        )}
      </div>
    </>
  );
}
