import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, CheckCheck, CircleAlert, Scale, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { dateToYmd, formatYmd, todayYmd } from "@/lib/dates/ymd";
import { formatMoneyBR } from "@/lib/validation/money";
import { fromCents, toCents } from "@/lib/finance/money";
import { getOfficeOverview } from "@/server/services/office-overview.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Visão geral" };

function Stat({ label, value, hint, href, alert = false }: { label: string; value: React.ReactNode; hint: string; href: string; alert?: boolean }) {
  return <Link href={href} className="group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
    <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-md"><CardBody className="min-h-[126px]">
      <div className="flex items-start justify-between gap-2"><p className="text-xs font-medium tracking-[0.01em] text-muted">{label}</p><ArrowUpRight aria-hidden className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-primary-text" /></div>
      <p className={`mt-3 break-words text-2xl font-semibold tracking-[-0.035em] tabular-nums sm:text-[28px] ${alert ? "text-danger" : ""}`}>{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{hint}</p>
    </CardBody></Card>
  </Link>;
}
const more = (href: string, label = "Ver todos") => <Link href={href} className="shrink-0 text-xs text-primary-text hover:underline">{label}</Link>;
const CASE_LABELS = { ACTIVE: "Em andamento", SUSPENDED: "Suspensos", CLOSED: "Encerrados", ARCHIVED: "Arquivados" };
const EVENT_LABELS = { HEARING: "Audiência", MEETING: "Reunião", DILIGENCE: "Diligência", OTHER: "Compromisso" };

export default async function OverviewPage() {
  const { ctx, session, organization } = await requireTenant();
  const d = await getOfficeOverview(ctx);
  const activeCases = d.portfolio?.statuses.find(s => s.status === "ACTIVE")?.count ?? 0;
  const taskBars = d.tasks ? [{ name: "A fazer", count: d.tasks.todo }, { name: "Em andamento", count: d.tasks.inProgress }, { name: "Aguardando", count: d.tasks.waiting }] : [];
  const finance = d.finance;
  const net = finance ? fromCents((toCents(finance.receivedThisMonth) ?? 0n) - (toCents(finance.paidThisMonth) ?? 0n)) : "0.00";
  const noModules = !d.tasks && !d.deadlines && !d.notices && !d.clients && !d.portfolio && !finance;
  return <div className="mx-auto max-w-7xl space-y-8">
    <PageHeader title={`Bom dia, ${session.user.name.split(" ")[0]}`} description={`${organization.name} · ${formatYmd(d.today)}. Aqui está o que merece atenção hoje e como está o escritório.`} />

    <section aria-labelledby="overview-priorities">
      <div className="mb-4 flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-bg"><CircleAlert aria-hidden className="h-4 w-4 text-warning" /></span><h2 id="overview-priorities" className="text-[15px] font-semibold tracking-[-0.01em]">O que precisa da sua atenção</h2></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d.deadlines ? <>
          <Stat label="Prazos vencidos" value={d.deadlines.overdue} hint="Em aberto, com data anterior a hoje" href="/prazos?atrasados=1" alert={d.deadlines.overdue > 0} />
          <Stat label="Prazos para hoje" value={d.deadlines.today} hint={`${d.deadlines.draft} aguardando validação no total`} href="/prazos" alert={d.deadlines.today > 0} />
        </> : null}
        {d.tasks ? <Stat label="Tarefas atrasadas" value={d.tasks.overdue} hint={`${d.tasks.open} tarefas abertas no escritório`} href="/tarefas?atrasadas=1" alert={d.tasks.overdue > 0} /> : null}
        {d.notices ? <div data-testid="func-to-box" className="h-full"><Stat label="Intimações para triagem" value={d.notices.new} hint={`${d.notices.distributed} distribuídas, ainda em tratamento`} href="/box" alert={d.notices.new > 0} /></div> : null}
      </div>
      {noModules ? <Card className="p-6 text-sm text-muted">Seu perfil ainda não tem acesso aos módulos desta visão geral. Peça à administração os acessos necessários para o seu trabalho.</Card> : null}
    </section>

    {finance ? <section aria-labelledby="overview-finance">
      <div className="mb-4 flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Wallet aria-hidden className="h-4 w-4 text-primary-text" /></span><h2 id="overview-finance" className="text-[15px] font-semibold tracking-[-0.01em]">Financeiro do escritório</h2><div className="ml-auto">{more("/financeiro", "Abrir financeiro")}</div></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Recebido neste mês" value={formatMoneyBR(finance.receivedThisMonth)} hint="Recebimentos efetivamente registrados" href="/financeiro" />
        <Stat label="Pago neste mês" value={formatMoneyBR(finance.paidThisMonth)} hint={`Resultado do mês: ${formatMoneyBR(net)}`} href="/financeiro" />
        <Stat label="A receber em aberto" value={formatMoneyBR(finance.receivableOpen)} hint={`${formatMoneyBR(finance.receivableOverdue)} com vencimento passado`} href="/financeiro/lancamentos?tipo=receber&status=aberto" alert={finance.receivableOverdue !== "0.00"} />
        <Stat label="A pagar em aberto" value={formatMoneyBR(finance.payableOpen)} hint={`${formatMoneyBR(finance.payableOverdue)} com vencimento passado`} href="/financeiro/lancamentos?tipo=pagar&status=aberto" alert={finance.payableOverdue !== "0.00"} />
      </div>
      <p className="mt-2 text-xs text-muted">Valores dos lançamentos e baixas cadastrados no financeiro. Este resumo não inclui movimentações fora da plataforma.</p>
    </section> : null}

    <div className="grid gap-5 xl:grid-cols-2">
      {d.deadlines ? <Card>
        <CardHeader title="Prazos que exigem acompanhamento" description="Até 5 prazos em aberto: vencidos primeiro, depois os próximos 7 dias." action={more("/prazos")} />
        {d.deadlines.items.length ? <ul className="divide-y divide-border">{d.deadlines.items.map(item => {
          const due = dateToYmd(item.dueDate);
          return <li key={item.id}><Link href={`/prazos/${item.id}`} className="flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-2/70">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="mt-1 truncate text-xs text-muted">{item.case.title}</p>{item.status === "DRAFT" ? <p className="mt-1 text-xs text-warning">Aguardando validação</p> : null}</div>
            <Badge tone={due < d.today ? "danger" : due === d.today ? "warning" : "neutral"}>{due < d.today ? "Vencido · " : due === d.today ? "Hoje · " : ""}{formatYmd(due)}</Badge>
          </Link></li>;
        })}</ul> : <CardBody><p className="text-sm text-muted">Nenhum prazo vencido ou previsto para os próximos 7 dias.</p></CardBody>}
      </Card> : null}
      {d.agenda ? <Card>
        <CardHeader title="Agenda dos próximos 7 dias" description="Audiências, reuniões e compromissos do escritório. Até 5 eventos." action={more("/agenda", "Abrir agenda")} />
        {d.agenda.length ? <ul className="divide-y divide-border">{d.agenda.map(item => <li key={item.id}><Link href={`/agenda/${item.id}`} className="block px-5 py-4 transition-colors hover:bg-surface-2/70">
          <div className="flex items-center gap-2"><CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-muted" /><p className="truncate text-sm font-medium">{item.title}</p></div>
          <p className="mt-1 text-xs text-muted">{EVENT_LABELS[item.kind]} · {item.allDay ? `${formatYmd(todayYmd(ctx.timezone, item.startsAt))} · dia inteiro` : formatDateTime(item.startsAt, ctx.timezone)}{item.location ? ` · ${item.location}` : ""}</p>
        </Link></li>)}</ul> : <CardBody><p className="text-sm text-muted">Nenhum compromisso cadastrado para os próximos 7 dias.</p></CardBody>}
      </Card> : null}
    </div>

    {d.tasks ? <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader title="Trabalho em andamento" description="Visão das tarefas abertas de todo o escritório que seu perfil permite consultar." action={more("/tarefas", "Abrir tarefas")} />
        <CardBody>
          <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-2xl font-semibold tabular-nums">{d.tasks.open}</p><p className="text-xs text-muted">tarefas abertas</p></div><div className="text-right"><p className="flex items-center justify-end gap-1 text-sm font-medium text-success"><CheckCheck aria-hidden className="h-4 w-4" />{d.tasks.completedMonth} concluídas</p><p className="text-xs text-muted">neste mês</p></div></div>
          <ul className="space-y-3">{taskBars.map(bar => <li key={bar.name}><div className="mb-1 flex justify-between text-xs"><span>{bar.name}</span><span className="tabular-nums">{bar.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${d.tasks!.open ? bar.count / d.tasks!.open * 100 : 0}%` }} /></div></li>)}</ul>
          <p className="mt-4 text-xs text-muted">{d.tasks.unassigned} tarefas abertas sem responsável. A quantidade de tarefas não mede, por si só, a complexidade do trabalho.</p>
        </CardBody>
      </Card>
      {d.team ? <Card>
        <CardHeader title="Distribuição de trabalho da equipe" description={`${d.team.length} membros ativos. Até 6 pessoas, priorizando atrasos e volume em aberto.`} action={more("/equipe", "Ver produtividade")} />
        <ul className="divide-y divide-border">{d.team.slice(0, 6).map(person => <li key={person.id}><Link href={`/tarefas?responsavel=${person.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"><span className="min-w-0 truncate text-sm">{person.name}</span><span className="shrink-0 text-right text-xs"><span className="block tabular-nums">{person.open} abertas</span><span className={person.overdue ? "text-danger" : "text-muted"}>{person.overdue} atrasadas</span></span></Link></li>)}</ul>
        {!d.team.length ? <CardBody><p className="text-sm text-muted">Nenhum membro ativo.</p></CardBody> : null}
      </Card> : null}
    </div> : null}

    {d.portfolio || d.clients ? <section aria-labelledby="overview-portfolio">
      <div className="mb-4 flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Scale aria-hidden className="h-4 w-4 text-primary-text" /></span><h2 id="overview-portfolio" className="text-[15px] font-semibold tracking-[-0.01em]">Carteira e relacionamento</h2></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d.clients ? <Stat label="Clientes ativos" value={d.clients.active} hint={`${d.clients.newMonth} clientes cadastrados neste mês`} href="/clientes" /> : null}
        {d.portfolio ? <>
          <Stat label="Processos em andamento" value={activeCases} hint={`${d.portfolio.newMonth} processos cadastrados neste mês`} href="/processos?status=ACTIVE" />
          <Stat label="Processos sem responsável" value={d.portfolio.unassigned} hint="Processos ativos sem responsável vinculado" href="/processos" alert={d.portfolio.unassigned > 0} />
          <Card><CardBody><p className="mb-3 flex items-center gap-2 text-xs text-muted"><Users aria-hidden className="h-4 w-4" />Situação da carteira</p><ul className="space-y-2 text-xs">{Object.entries(CASE_LABELS).map(([status, label]) => <li key={status}><Link href={`/processos?status=${status}`} className="flex justify-between gap-2 hover:text-primary-text"><span>{label}</span><span className="font-medium tabular-nums">{d.portfolio!.statuses.find(s => s.status === status)?.count ?? 0}</span></Link></li>)}</ul></CardBody></Card>
        </> : null}
      </div>
      <p className="mt-2 text-xs text-muted">Cadastros do mês incluem importações. A carteira não inclui processos movidos para o acervo. Os indicadores respeitam os acessos do seu perfil e a visibilidade dos processos.</p>
    </section> : null}
  </div>;
}
