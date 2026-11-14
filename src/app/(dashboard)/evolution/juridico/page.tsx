import { listDocumentReviews } from "@/server/services/document-review.service";
import Link from "next/link";
import { ArrowUpRight, FolderOpen, Hourglass, FileText, Calculator, Bot, Plus, Bell } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { EmptyState } from "@/components/evolution/empty-state";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";
import { listCases } from "@/server/services/case.service";
import { DataError } from "@/components/evolution/data-error";
import { TasksWorkspace, type TaskSearchParams } from "@/modules/tasks/tasks-workspace";
import { alertCounts, availableAlertTabs } from "@/server/services/insights.service";

type CaseListResult = Awaited<ReturnType<typeof listCases>>;

export default async function JuridicoPage({ searchParams }: { searchParams: Promise<TaskSearchParams> }) {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.juridico;
  const [ind, indErr] = await getIndicators(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const);
  const reviews = can(ctx, "documents:read") ? await listDocumentReviews(ctx, undefined, true).then(items => ({ items, error: false })).catch(() => ({ items: [], error: true })) : null;
  const hasCases = can(ctx, "cases:read");
  const hasTasks = can(ctx, "tasks:read");
  const attentionTabs = availableAlertTabs(ctx).filter((tab) => tab.key !== "aniversarios");
  const [alerts, alertsErr] = attentionTabs.length
    ? await alertCounts(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const)
    : [null, false] as const;
  const [cases, casesErr] = hasCases
    ? await listCases(ctx, { page: 1, status: "ACTIVE" }).then((r) => [r, false] as const).catch(() => [{ items: [] as CaseListResult["items"], total: 0 }, true] as const)
    : [{ items: [] as CaseListResult["items"], total: 0 }, false] as const;

  if (!hasCases && !hasTasks && !attentionTabs.length) {
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

      {attentionTabs.length > 0 && <section className="mt-8" aria-label="Pendências jurídicas e operacionais">
        <div className="mb-3"><h2 className="text-base font-semibold">Pendências jurídicas e operacionais</h2><p className="mt-1 text-sm text-muted">Alertas, prazos e tarefas reunidos na mesma área.</p></div>
        {alertsErr && <DataError message="Não foi possível carregar os alertas" />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attentionTabs.map((tab) => <Link key={tab.key} href={`/alertas?aba=${tab.key}`} className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 hover:bg-surface-2"><span className="flex items-center gap-2 text-sm font-medium group-hover:text-primary"><Bell className="h-4 w-4" aria-hidden />{tab.label}</span><span className="text-xl font-semibold tabular-nums">{alertsErr ? "—" : alerts?.[tab.key] ?? 0}</span></Link>)}
          <Link href="/alertas" className="rounded-xl border border-border bg-surface p-4 text-sm font-medium text-primary hover:bg-surface-2">Abrir central de alertas</Link>
        </div>
      </section>}

      {hasTasks && <section className="mt-8" aria-label="Mesa de controle operacional"><h2 className="mb-3 text-base font-semibold">Operação jurídica · tarefas</h2><TasksWorkspace searchParams={searchParams} basePath="/evolution/juridico" embedded /></section>}

      {hasCases && <section className="mt-8">
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
      </section>}

      {reviews && <section className="mt-8" aria-label="Fila de revisão jurídica">
        <h2 className="mb-3 text-base font-semibold">Produção jurídica · revisão de documentos</h2>
        {reviews.error ? <DataError message="Não foi possível carregar as revisões" /> : <>
          <p className="mb-3 text-sm text-muted">Até 100 revisões pendentes visíveis para seu perfil, da mais recente à mais antiga. Abra o documento para conferir a versão, aprovar ou solicitar ajustes.</p>
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {reviews.items.filter(r => r.status === "IN_REVIEW").map(r => <Link key={r.id} href={`/documentos/${r.documentId}`} className="flex justify-between gap-3 p-4 hover:bg-surface-2"><span>{r.document.name}</span><span className="text-sm text-muted">Versão {r.version} · Em revisão</span></Link>)}
            {!reviews.items.some(r => r.status === "IN_REVIEW") && <p className="p-4 text-sm text-muted">Nenhuma revisão pendente nesta lista.</p>}
          </div>
          <Link href="/documentos" className="mt-3 inline-block text-sm text-primary">Abrir documentos e solicitar revisão</Link>
        </>}
      </section>}

      <h2 className="mt-8 mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hasCases && <Link href="/processos" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
          <FolderOpen className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium group-hover:text-primary">Processos</p>
            <p className="text-[12px] text-muted">Cadastro, partes, linha do tempo e carteira</p>
          </div>
        </Link>}
        {attentionTabs.length > 0 && <Link href="/alertas" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md"><Bell className="h-5 w-5 text-muted" aria-hidden /><div><p className="text-sm font-medium group-hover:text-primary">Central de alertas</p><p className="text-[12px] text-muted">Pendências jurídicas e operacionais</p></div></Link>}
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
