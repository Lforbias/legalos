import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Bot, Briefcase, CalendarClock, CheckSquare, Clock, FilePlus2, MessageCircle, MessagesSquare, UserPlus, Wallet } from "lucide-react";
import { DEPARTMENTS, departmentItems, type Department } from "@/config/evolution-navigation";
import { COWORK_AREA } from "@/config/office-map";
import { DataError } from "@/components/evolution/data-error";
import { firstName, greetingFor } from "@/modules/auth/login-intro";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { getIndicators } from "@/server/services/insights.service";
import { coworkUnreadTotal } from "@/server/services/cowork-channel.service";

export const metadata = { title: "Meu Escritório" };

const DEPT_ORDER: Department[] = ["juridico", "atendimento", "comercial", "financeiro", "administracao"];
const dept = (color: string) => ({ "--dept": color }) as React.CSSProperties;

function localNow(timeZone: string) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now);
  return { hour, date };
}

function Stat({ icon: Icon, label, value, href, alert = false, color }: { icon: LucideIcon; label: string; value: number; href: string; alert?: boolean; color: string }) {
  return (
    <Link href={href} style={dept(color)} className="dept-tile block rounded-2xl border border-border bg-surface p-4">
      <span className="flex items-center justify-between gap-2 text-xs text-muted">
        {label}
        <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
      </span>
      <span className={`mt-1.5 block text-[28px] font-semibold tracking-[-0.035em] tabular-nums ${alert ? "text-danger" : ""}`}>{value}</span>
    </Link>
  );
}

export default async function EvolutionLobby() {
  const { ctx, session, organization } = await requireTenant();
  const [ind, indErr] = await getIndicators(ctx).then((r) => [r, false] as const).catch(() => [null, true] as const);
  const coworkOn = can(ctx, "cowork:read");
  const unread = coworkOn ? await coworkUnreadTotal(ctx).catch(() => 0) : 0;
  const { hour, date } = localNow(organization.timezone);
  const name = firstName(session.user.name);
  const mine = ind?.mine;

  const flows = [
    can(ctx, "whatsapp:read") && can(ctx, "crm:write") ? { href: "/crm/novo", icon: MessageCircle, from: "atendimento" as Department, label: "Atendimento → Comercial", text: "Registrar uma oportunidade no CRM" } : null,
    can(ctx, "crm:read") && can(ctx, "cases:write") ? { href: "/processos/novo", icon: Briefcase, from: "comercial" as Department, label: "Comercial → Jurídico", text: "Iniciar o cadastro de um processo" } : null,
    can(ctx, "cases:read") && can(ctx, "finance:write") ? { href: "/financeiro/lancamentos/novo", icon: Wallet, from: "juridico" as Department, label: "Jurídico → Financeiro", text: "Registrar honorários ou despesas" } : null,
  ].filter((f) => f !== null);

  const shortcuts = [
    can(ctx, "clients:write") ? { href: "/clientes/novo", icon: UserPlus, label: "Novo cliente" } : null,
    can(ctx, "tasks:write") ? { href: "/tarefas/nova", icon: CheckSquare, label: "Nova tarefa" } : null,
    can(ctx, "cases:write") ? { href: "/processos/novo", icon: FilePlus2, label: "Novo processo" } : null,
    can(ctx, "ai:use") ? { href: "/ia", icon: Bot, label: "Perguntar à RUTE" } : null,
  ].filter((s) => s !== null);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary-text">Meu Escritório</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] sm:text-[34px]">{greetingFor(hour)}{name ? `, ${name}` : ""}</h1>
          <p className="mt-1 text-sm text-muted">{organization.name} · {date}</p>
        </div>
        <Link href="/evolution/mesa" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover">
          Abrir Minha Mesa <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      <section aria-labelledby="lobby-today" className="mb-8">
        <h2 id="lobby-today" className="sr-only">Minha Mesa hoje</h2>
        {indErr ? <DataError message="Não foi possível carregar o resumo pessoal" /> : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {mine?.tasksOpen != null ? <Stat icon={CheckSquare} label="Minhas tarefas" value={mine.tasksOpen} href="/tarefas" color={DEPARTMENTS.mesa.color} /> : null}
            {mine?.deadlinesNext7 != null ? <Stat icon={CalendarClock} label="Prazos em 7 dias" value={mine.deadlinesNext7} href="/prazos" color={DEPARTMENTS.comercial.color} /> : null}
            {mine?.deadlinesOverdue != null ? <Stat icon={Clock} label="Prazos vencidos" value={mine.deadlinesOverdue} href="/prazos?atrasados=1" alert={mine.deadlinesOverdue > 0} color="#ef4444" /> : null}
            {coworkOn ? <Stat icon={MessagesSquare} label="Cowork não lidas" value={unread} href={COWORK_AREA.href} color={COWORK_AREA.color} /> : null}
          </div>
        )}
      </section>

      <section aria-labelledby="lobby-areas">
        <h2 id="lobby-areas" className="mb-3 text-base font-semibold">Departamentos</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEPT_ORDER.map((d) => {
            const info = DEPARTMENTS[d];
            const Icon = info.icon;
            const items = departmentItems(d).filter((n) => !n.permission || can(ctx, n.permission));
            const week = d === "juridico" ? mine?.deadlinesNext7 ?? 0 : 0;
            return (
              <li key={d}>
                <Link href={`/evolution/${d}`} style={dept(info.color)} className="dept-tile flex h-full flex-col rounded-[18px] border border-border bg-surface p-5" data-testid={`lobby-area-${d}`}>
                  <span className="flex items-center gap-3">
                    <span className="dept-swatch flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white" aria-hidden><Icon className="h-[18px] w-[18px]" /></span>
                    <span className="text-[15px] font-semibold">{info.name}</span>
                    {week > 0 ? <span className="ml-auto text-xs text-muted">{week} {week === 1 ? "prazo" : "prazos"} na semana</span> : null}
                  </span>
                  <span className="mt-3 text-[13px] leading-relaxed text-muted">{info.summary}</span>
                  {items.length > 0 ? (
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {items.slice(0, 4).map((item) => <span key={item.key} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{item.label}</span>)}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          {coworkOn ? (
            <li>
              <Link href={COWORK_AREA.href} style={dept(COWORK_AREA.color)} className="dept-tile flex h-full flex-col rounded-[18px] border border-border bg-surface p-5" data-testid="lobby-area-cowork">
                <span className="flex items-center gap-3">
                  <span className="dept-swatch flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" aria-hidden><MessagesSquare className="h-[18px] w-[18px]" /></span>
                  <span className="text-[15px] font-semibold">{COWORK_AREA.name}</span>
                  {unread > 0 ? <span className="ml-auto text-xs text-muted">{unread} não {unread === 1 ? "lida" : "lidas"}</span> : null}
                </span>
                <span className="mt-3 text-[13px] leading-relaxed text-muted">{COWORK_AREA.summary}</span>
              </Link>
            </li>
          ) : null}
        </ul>
      </section>

      {flows.length > 0 || shortcuts.length > 0 ? (
        <div className="mt-8 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          {flows.length > 0 ? (
            <section aria-labelledby="department-flows-heading" className="rounded-[18px] border border-border bg-surface p-5">
              <h2 id="department-flows-heading" className="text-sm font-semibold">Continue o fluxo entre áreas</h2>
              <ul className="mt-2">
                {flows.map((f) => (
                  <li key={f.href} className="border-t border-border first:border-t-0">
                    <Link href={f.href} className="group flex items-center gap-3 py-3">
                      <f.icon className="h-4 w-4 shrink-0" style={{ color: DEPARTMENTS[f.from].color }} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium group-hover:text-primary-text">{f.label}</span>
                        <span className="block text-xs text-muted">{f.text}</span>
                      </span>
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {shortcuts.length > 0 ? (
            <section aria-labelledby="lobby-shortcuts" className="rounded-[18px] border border-border bg-surface p-5">
              <h2 id="lobby-shortcuts" className="text-sm font-semibold">Atalhos</h2>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {shortcuts.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm transition hover:bg-surface-2">
                      <s.icon className="h-4 w-4 shrink-0 text-muted" aria-hidden /> {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
