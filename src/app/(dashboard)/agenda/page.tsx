import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { addDays, dateToYmd, todayYmd, weekday } from "@/lib/dates/ymd";
import { cn } from "@/lib/utils";
import { EVENT_KIND_LABEL } from "@/modules/agenda/schemas";
import { STATUS_TONE } from "@/modules/deadlines/tone";
import { can } from "@/server/context";
import { listEvents } from "@/server/services/agenda.service";
import { listDeadlines } from "@/server/services/deadline.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Agenda" };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ctx } = await requireTenant();
  const canDeadlines = can(ctx, "deadlines:read");
  if (!canDeadlines && !can(ctx, "tasks:read")) return <AccessDenied />;
  const sp = await searchParams;
  const today = todayYmd(ctx.timezone);
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? (sp.mes as string) : today.slice(0, 7);
  const first = `${ym}-01`;
  const gridStart = addDays(first, -weekday(first));
  const gridEnd = addDays(gridStart, 41);
  const [events, deadlines] = await Promise.all([
    listEvents(ctx, gridStart, gridEnd),
    canDeadlines ? listDeadlines(ctx, { from: gridStart, to: gridEnd, includeClosed: false }) : Promise.resolve({ items: [], truncated: false, total: 0 }),
  ]);
  const canWrite = can(ctx, "deadlines:write") || can(ctx, "tasks:write");
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const [y, m] = ym.split("-").map(Number) as [number, number];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Agenda"
        description="Audiências, reuniões, diligências e prazos em aberto. Prazos em rascunho aparecem destacados até serem validados."
        actions={
          <div className="flex gap-2">
            {canDeadlines ? <Link href="/prazos" className={buttonVariants({ variant: "secondary" })}>Lista de prazos</Link> : null}
            {canWrite ? (
              <Link href={`/agenda/novo?data=${today}`} className={buttonVariants({})}>
                <Plus className="h-4 w-4" aria-hidden /> Novo compromisso
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <Link href={`/agenda?mes=${shiftMonth(ym, -1)}`} aria-label="Mês anterior" className={buttonVariants({ variant: "secondary", size: "icon" })}><ChevronLeft className="h-4 w-4" aria-hidden /></Link>
        <h2 className="min-w-44 text-center text-base font-semibold capitalize" aria-live="polite">{MONTHS[m - 1]} de {y}</h2>
        <Link href={`/agenda?mes=${shiftMonth(ym, 1)}`} aria-label="Próximo mês" className={buttonVariants({ variant: "secondary", size: "icon" })}><ChevronRight className="h-4 w-4" aria-hidden /></Link>
        <Link href="/agenda" className={buttonVariants({ variant: "ghost" })}>Hoje</Link>
      </div>

      {/* grade mensal (telas médias e grandes) */}
      <Card className="hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-xs text-muted">
          {WEEK.map((w) => (
            <div key={w} className="py-1.5 capitalize">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = day.startsWith(ym);
            const evs = events.filter((e) => e.date === day);
            const dls = deadlines.items.filter((d) => dateToYmd(d.dueDate) === day);
            return (
              <div key={day} className={cn("min-h-28 border-b border-r border-border p-1.5 text-xs", !inMonth && "bg-surface-2/50 text-muted")}>
                <p className={cn("mb-1 font-medium", day === today && "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg")}>{Number(day.slice(8))}</p>
                <ul className="space-y-1">
                  {dls.slice(0, 3).map((d) => (
                    <li key={d.id}>
                      <Link href={`/prazos/${d.id}`} className={cn("block truncate rounded px-1 py-0.5", d.status === "DRAFT" ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger")} title={`Prazo: ${d.title}${d.status === "DRAFT" ? " (aguardando validação)" : ""}`}>
                        Prazo: {d.title}
                      </Link>
                    </li>
                  ))}
                  {evs.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <Link href={`/agenda/${e.id}`} className="block truncate rounded bg-info-bg px-1 py-0.5 text-primary-text" title={e.title}>
                        {e.allDay ? "" : `${e.startTime} `}{e.title}
                      </Link>
                    </li>
                  ))}
                  {dls.length + evs.length > 6 ? <li className="text-muted">+{dls.length + evs.length - 6} mais</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      {/* lista do mês (alternativa para telas pequenas e leitores de tela) */}
      <section aria-label="Lista do mês" className={cn("mt-4 space-y-2", "md:mt-6")}>
        <h2 className="text-sm font-semibold">Neste mês</h2>
        {(() => {
          const rows = [
            ...events.filter((e) => e.date.startsWith(ym)).map((e) => ({ key: `e${e.id}`, date: e.date, time: e.allDay ? "Dia inteiro" : e.startTime, href: `/agenda/${e.id}`, label: e.title, tag: EVENT_KIND_LABEL[e.kind], tone: "info" as const })),
            ...deadlines.items.filter((d) => dateToYmd(d.dueDate).startsWith(ym)).map((d) => ({ key: `d${d.id}`, date: dateToYmd(d.dueDate), time: "Prazo", href: `/prazos/${d.id}`, label: d.title, tag: d.status === "DRAFT" ? "Prazo (não validado)" : "Prazo", tone: STATUS_TONE[d.status] })),
          ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
          if (rows.length === 0) return <p className="text-sm text-muted">Nada agendado neste mês.</p>;
          return (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {rows.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-muted">{r.date.split("-").reverse().slice(0, 2).join("/")} · {r.time}</span>
                  <Link href={r.href} className="font-medium hover:underline">{r.label}</Link>
                  <Badge tone={r.tone}>{r.tag}</Badge>
                </li>
              ))}
            </ul>
          );
        })()}
      </section>
      {deadlines.truncated ? <p className="mt-2 text-xs text-warning">Há mais prazos do que o exibido neste período; use a lista de prazos.</p> : null}
    </div>
  );
}
