import Link from "next/link";
import { ArrowRight, CalendarClock, CheckSquare, Clock, MessageCircle, Briefcase, Scale, Wallet } from "lucide-react";
import { DEPARTMENTS, departmentItems, type Department } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { DataError } from "@/components/evolution/data-error";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";

const DEPT_ORDER: Department[] = ["juridico", "controladoria", "atendimento", "comercial", "financeiro", "administracao"];

export default async function EvolutionLobby() {
  const { ctx } = await requireTenant();
  const [ind, indErr] = await getIndicators(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const);
  return (
    <>
      <DepartmentHeader
        icon={DEPARTMENTS.lobby.icon}
        color={DEPARTMENTS.lobby.color}
        title="Meu Escritório"
        description="Bem-vindo ao LegalOS Evolution. Escolha um departamento para começar."
      />

      <section className="mb-8 rounded-xl border border-border bg-surface p-5" aria-labelledby="my-desk-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="my-desk-heading" className="text-base font-semibold">Minha Mesa hoje</h2>
            <p className="mt-1 text-sm text-muted">Resumo pessoal de tarefas e prazos atribuídos a você.</p>
          </div>
          <Link href="/evolution/mesa" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Abrir mesa <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {indErr && <DataError message="Não foi possível carregar o resumo pessoal" />}
        {!indErr && (
          <div className="grid gap-3 sm:grid-cols-3">
            {ind?.mine.tasksOpen != null && <StatCard icon={CheckSquare} label="Tarefas pendentes" value={ind.mine.tasksOpen} detail={ind.mine.tasksOverdue ? `${ind.mine.tasksOverdue} em atraso` : undefined} color="#6366f1" />}
            {ind?.mine.deadlinesNext7 != null && <StatCard icon={CalendarClock} label="Prazos nos próximos 7 dias" value={ind.mine.deadlinesNext7} color="#f59e0b" />}
            {ind?.mine.deadlinesOverdue != null && <StatCard icon={Clock} label="Prazos vencidos" value={ind.mine.deadlinesOverdue} color="#ef4444" />}
          </div>
        )}
      </section>

      <section className="mb-8" aria-labelledby="department-flows-heading">
        <div className="mb-3">
          <h2 id="department-flows-heading" className="text-base font-semibold">Continue o fluxo entre áreas</h2>
          <p className="mt-1 text-sm text-muted">Atalhos para registrar a próxima etapa nos módulos existentes.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {can(ctx, "whatsapp:read") && can(ctx, "crm:write") && (
            <Link href="/crm/novo" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
              <MessageCircle className="h-5 w-5 text-muted" aria-hidden />
              <div>
                <p className="text-sm font-medium group-hover:text-primary">Atendimento → Comercial</p>
                <p className="text-[12px] text-muted">Registrar uma oportunidade no CRM</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted" aria-hidden />
            </Link>
          )}
          {can(ctx, "crm:read") && can(ctx, "cases:write") && (
            <Link href="/processos/novo" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
              <Briefcase className="h-5 w-5 text-muted" aria-hidden />
              <div>
                <p className="text-sm font-medium group-hover:text-primary">Comercial → Jurídico</p>
                <p className="text-[12px] text-muted">Iniciar o cadastro de um processo</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted" aria-hidden />
            </Link>
          )}
          {can(ctx, "cases:read") && can(ctx, "finance:write") && (
            <Link href="/financeiro/lancamentos/novo" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
              <Scale className="h-5 w-5 text-muted" aria-hidden />
              <div>
                <p className="text-sm font-medium group-hover:text-primary">Jurídico → Financeiro</p>
                <p className="text-[12px] text-muted">Registrar honorários ou despesas</p>
              </div>
              <Wallet className="ml-auto h-4 w-4 text-muted" aria-hidden />
            </Link>
          )}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEPT_ORDER.map((dept) => {
          const info = DEPARTMENTS[dept];
          const items = departmentItems(dept);
          const visibleItems = items.filter((n) => !n.permission || can(ctx, n.permission));
          const Icon = info.icon;
          return (
            <Link
              key={dept}
              href={`/evolution/${dept}`}
              className="group relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${info.color}18` }}>
                  <Icon className="h-5 w-5" style={{ color: info.color }} aria-hidden />
                </span>
                <h2 className="text-base font-semibold">{info.name}</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">{info.summary}</p>
              {visibleItems.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {visibleItems.slice(0, 4).map((item) => (
                    <span key={item.key} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{item.label}</span>
                  ))}
                </div>
              )}
              <ArrowRight className="absolute right-4 top-5 h-4 w-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-border/60 bg-surface-2/50 p-5">
        <h3 className="text-sm font-semibold">Sobre a Evolution 1.0</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Esta é a nova experiência departamental do LegalOS. As funcionalidades existentes continuam disponíveis — os departamentos reorganizam o acesso em torno da rotina do escritório. Você pode voltar ao Ethos a qualquer momento pelo menu lateral.
        </p>
      </div>
    </>
  );
}
