import Link from "next/link";
import { ArrowUpRight, FolderOpen, Hourglass, FileText, Calculator, Bot, Plus } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { EmptyState } from "@/components/evolution/empty-state";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";
import { listCases } from "@/server/services/case.service";
import { DataError } from "@/components/evolution/data-error";

type CaseListResult = Awaited<ReturnType<typeof listCases>>;

export default async function JuridicoPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.juridico;
  const [ind, indErr] = await getIndicators(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const);
  const hasCases = can(ctx, "cases:read");
  const [cases, casesErr] = hasCases
    ? await listCases(ctx, { page: 1, status: "ACTIVE" }).then((r) => [r, false] as const).catch(() => [{ items: [] as CaseListResult["items"], total: 0 }, true] as const)
    : [{ items: [] as CaseListResult["items"], total: 0 }, false] as const;

  if (!hasCases) {
    return (
      <>
        <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />
        <EmptyState icon={FolderOpen} title="Sem acesso ao Jurídico" description="Seu perfil não tem permissão para acessar processos. Solicite acesso ao administrador." />
      </>
    );
  }

  const overdueTasks = ind?.overdue.find((r) => r.key === "tasks");
  const overdueDeadlines = ind?.overdue.find((r) => r.key === "deadlines");
  const staleCases = ind?.movement?.windows[0]?.without ?? null;

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      {(indErr || casesErr) && <DataError message="Não foi possível carregar alguns indicadores do Jurídico" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FolderOpen} label="Processos ativos" value={casesErr ? "—" : cases.total} color={dept.color} />
        {overdueDeadlines && <StatCard icon={Hourglass} label="Prazos em atraso" value={overdueDeadlines.count} color="#ef4444" />}
        {overdueTasks && <StatCard icon={FolderOpen} label="Tarefas em atraso" value={overdueTasks.count} color="#f59e0b" />}
        {staleCases !== null && staleCases > 0 && <StatCard icon={FolderOpen} label="Processos parados" value={staleCases} detail="sem movimentação recente" color="#64748b" />}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Processos ativos recentes</h2>
            <p className="mt-1 text-sm text-muted">Atualizados recentemente, respeitando o sigilo e a carteira visível para seu perfil.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/processos" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm transition hover:bg-surface-2">Ver carteira <ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
            {can(ctx, "cases:write") && <Link href="/processos/novo" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"><Plus className="h-4 w-4" aria-hidden />Novo caso</Link>}
          </div>
        </div>
        {casesErr ? null : cases.items.length > 0 ? (
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {cases.items.slice(0, 6).map((item) => {
              const clientNames = item.parties.map((party) => party.client?.name ?? party.name).filter(Boolean);
              return (
                <Link key={item.id} href={`/processos/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:text-primary">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">{item.number ?? item.legacyNumber ?? "Sem número"}{clientNames[0] ? ` · ${clientNames[0]}` : ""}{item.department?.name ? ` · ${item.department.name}` : item.area ? ` · ${item.area}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                    {item.responsible?.name && <span>{item.responsible.name}</span>}
                    <span>{item.updatedAt.toLocaleDateString("pt-BR", { timeZone: ctx.timezone, day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">Nenhum processo ativo visível nesta carteira.</p>}
        {casesErr && <p className="mt-3 text-sm text-muted">A lista de processos recentes não pôde ser carregada.</p>}
      </section>

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
