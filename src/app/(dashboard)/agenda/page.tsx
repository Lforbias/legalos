import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageActionsMenu } from "@/components/layout/page-actions-menu";
import { PageHeader } from "@/components/layout/page-header";
import { FilterPanel } from "@/components/layout/filter-panel";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { ActivityCard } from "@/modules/activities/activity-card";
import { addDays, formatYmd, isYmd, todayYmd, weekday } from "@/lib/dates/ymd";
import { cn } from "@/lib/utils";
import { can } from "@/server/context";
import { activityFilterSchema, listActivities } from "@/server/services/activity.service";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Agenda" };
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const VIEWS = [{ value: "dia", label: "Dia" }, { value: "semana", label: "Semana" }, { value: "mes", label: "Mês" }, { value: "lista", label: "Lista" }] as const;
type SearchParams = { mes?: string; data?: string; visao?: string; tipo?: string; responsavel?: string; closed?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "deadlines:read") && !can(ctx, "tasks:read")) return <AccessDenied />;
  const sp = await searchParams;
  const today = todayYmd(ctx.timezone);
  const selected = sp.data && isYmd(sp.data) ? sp.data : /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? `${sp.mes}-01` : today;
  const view = VIEWS.some((v) => v.value === sp.visao) ? sp.visao! : "mes";
  const ym = selected.slice(0, 7);
  const first = `${ym}-01`;
  const from = view === "dia" ? selected : view === "semana" ? addDays(selected, -((weekday(selected) + 6) % 7)) : view === "mes" ? addDays(first, -weekday(first)) : selected;
  const length = view === "dia" ? 1 : view === "semana" ? 7 : view === "mes" ? 42 : 31;
  const to = addDays(from, length - 1);
  const filters = activityFilterSchema.safeParse({ from, to, kind: sp.tipo || undefined, assigneeId: sp.responsavel || undefined, includeClosed: sp.closed === "1" });
  const [data, members] = await Promise.all([
    listActivities(ctx, filters.success ? filters.data : { from, to }),
    listActiveMembers(ctx),
  ]);
  const days = Array.from({ length }, (_, i) => addDays(from, i));
  const shifted = (direction: number) => view === "mes"
    ? new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + direction, 1)).toISOString().slice(0, 10)
    : addDays(selected, direction * (view === "dia" ? 1 : view === "semana" ? 7 : 31));
  const href = (date: string, nextView = view) => `/agenda?${new URLSearchParams({
    data: date, visao: nextView,
    ...(sp.tipo ? { tipo: sp.tipo } : {}),
    ...(sp.responsavel ? { responsavel: sp.responsavel } : {}),
    ...(sp.closed ? { closed: sp.closed } : {}),
  })}`;
  const periodTitle = view === "mes" ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`
    : view === "dia" ? formatYmd(selected) : `${formatYmd(from)} a ${formatYmd(to)}`;
  const hasFilters = Boolean(sp.tipo || sp.responsavel || sp.closed === "1");
  const clearHref = `/agenda?${new URLSearchParams({ data: selected, visao: view })}`;
  const actions = [
    { href: "/gestao", label: "Ver no quadro de gestão" },
    ...(can(ctx, "deadlines:read") ? [{ href: "/prazos", label: "Lista de prazos" }] : []),
    ...(can(ctx, "tasks:write") ? [{ href: "/tarefas/nova", label: "Nova tarefa" }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Agenda" description="Organize o dia do escritório: compromissos, tarefas e prazos em um só lugar." actions={
        <>
          <PageActionsMenu items={actions} label="Mais ações da agenda" />
          {can(ctx, "deadlines:write") || can(ctx, "tasks:write") ? (
            <Link href={`/agenda/novo?data=${selected}`} className={buttonVariants({})}><Plus className="h-4 w-4" aria-hidden /> Novo compromisso</Link>
          ) : null}
        </>
      } />

      <FilterPanel label="Filtros da agenda" activeCount={[sp.tipo, sp.responsavel, sp.closed === "1"].filter(Boolean).length}>
      <form method="get" className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[170px_1fr_1fr_auto_auto]" role="search" aria-label="Filtrar agenda">
        <input type="hidden" name="visao" value={view} />
        <Field label="Data de referência" htmlFor="ad"><Input id="ad" name="data" type="date" defaultValue={selected} /></Field>
        <Field label="Tipo" htmlFor="ak"><Select id="ak" name="tipo" defaultValue={sp.tipo ?? ""}><option value="">Todas as atividades</option><option value="TASK">Tarefas</option><option value="EVENT">Compromissos</option><option value="DEADLINE">Prazos</option></Select></Field>
        <Field label="Responsável" htmlFor="ar"><Select id="ar" name="responsavel" defaultValue={sp.responsavel ?? ""}><option value="">Todos os responsáveis</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted"><input name="closed" type="checkbox" value="1" defaultChecked={sp.closed === "1"} className="h-4 w-4 accent-primary" />Incluir concluídos/cancelados</label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Aplicar filtros</button>
        {hasFilters ? <Link href={clearHref} className="text-xs text-muted underline underline-offset-4 sm:col-span-2 xl:col-span-full">Limpar filtros</Link> : null}
      </form>
      </FilterPanel>
      {!filters.success ? <Alert tone="error">Filtro inválido; mostrando todos os tipos e responsáveis no período.</Alert> : null}

      <section aria-label="Calendário" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5">
              <Link href={href(shifted(-1))} aria-label={view === "mes" ? "Mês anterior" : "Período anterior"} className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft className="h-4 w-4" aria-hidden /></Link>
              <Link href={href(shifted(1))} aria-label={view === "mes" ? "Próximo mês" : "Próximo período"} className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight className="h-4 w-4" aria-hidden /></Link>
            </div>
            <h2 className="text-lg font-semibold tracking-tight first-letter:uppercase">{periodTitle}</h2>
            <Link href={href(today)} className={buttonVariants({ variant: "ghost" })}>Hoje</Link>
          </div>
          <nav aria-label="Visualização da agenda" className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-surface p-1">
            {VIEWS.map((v) => <Link key={v.value} href={href(selected, v.value)} aria-current={view === v.value ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary", view === v.value ? "bg-surface-3 font-medium text-fg" : "text-muted hover:text-fg")}>{v.label}</Link>)}
          </nav>
        </div>
        <p className="text-xs leading-5 text-muted">{data.total} atividade(s) no período. {data.truncated ? "Exibindo até 300; refine os filtros. " : ""}Tarefas sem data ficam na lista de tarefas.</p>
        <div className={view === "mes" || view === "semana" ? "grid gap-2 md:grid-cols-7" : "space-y-3"}>
          {days.map((day) => {
            const items = data.items.filter((i) => i.date === day);
            if (view === "lista" && !items.length) return null;
            const isToday = day === today;
            const outsideMonth = view === "mes" && !day.startsWith(ym);
            return (
              <section key={day} aria-label={formatYmd(day)} className={cn(
                "min-w-0 rounded-xl border p-3",
                isToday ? "border-primary/50 bg-info-bg" : "border-border bg-surface",
                (view === "mes" || view === "semana") && "md:min-h-32",
                outsideMonth && "bg-surface-2/50 text-muted",
                view === "mes" && !items.length && !isToday && "hidden md:block",
              )}>
                <h3 className="mb-3 flex flex-wrap items-center justify-between gap-1 text-xs font-medium">
                  <span><span className="text-muted">{WEEK[weekday(day)]}</span> · <time dateTime={day} aria-current={isToday ? "date" : undefined}>{day.slice(8)}/{day.slice(5, 7)}</time></span>
                  {isToday ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-fg">Hoje</span> : null}
                </h3>
                <div className={cn("gap-3", view === "dia" || view === "lista" ? "grid lg:grid-cols-2 xl:grid-cols-3" : "space-y-2")}>
                  {items.map((i) => <ActivityCard key={`${i.kind}:${i.id}`} item={i} />)}
                  {!items.length ? <p className="py-2 text-xs text-muted">Sem atividades.</p> : null}
                </div>
              </section>
            );
          })}
        </div>
        {!data.total ? <Card className="px-6 py-8 text-center"><p className="text-sm font-medium">Nenhuma atividade no período.</p><p className="mt-1 text-xs text-muted">Escolha outra data{hasFilters ? " ou limpe os filtros" : " para consultar a agenda"}.</p>{hasFilters ? <Link href={clearHref} className="mt-3 inline-block text-sm underline underline-offset-4">Limpar filtros</Link> : null}</Card> : null}
      </section>
    </div>
  );
}
