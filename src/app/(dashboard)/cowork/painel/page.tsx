import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { RecordBackLink } from "@/components/layout/record-back-link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatYmd, isYmd } from "@/lib/dates/ymd";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { coworkAvailability, listCoworkPeople } from "@/server/services/cowork-access.service";
import { getInsights } from "@/server/services/cowork-insights.service";
import { COWORK_DEPARTMENT_LABEL, COWORK_DEPARTMENTS, WORK_STATE_LABEL } from "@/modules/cowork/constants";

export const metadata: Metadata = { title: "Painel do trabalho — Cowork" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sel = "h-9 rounded-lg border border-border bg-bg/45 px-2.5 text-sm";
const hours = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;

type SP = { de?: string; ate?: string; pessoa?: string; equipe?: string; dep?: string; processo?: string; situacao?: string };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!(await coworkAvailability(ctx)).ok || !can(ctx, "cowork:insights")) return <AccessDenied detail="O painel do trabalho exige a permissão “Ver o painel de acompanhamento do trabalho da equipe”." />;
  const sp = await searchParams;
  const status = ["TODO", "IN_PROGRESS", "WAITING", "DONE", "OVERDUE"].includes(sp.situacao ?? "") ? (sp.situacao as "TODO") : undefined;
  const data = await getInsights(ctx, {
    from: sp.de && isYmd(sp.de) ? sp.de : undefined,
    to: sp.ate && isYmd(sp.ate) ? sp.ate : undefined,
    userId: sp.pessoa && UUID.test(sp.pessoa) ? sp.pessoa : undefined,
    teamId: sp.equipe && UUID.test(sp.equipe) ? sp.equipe : undefined,
    department: sp.dep || undefined,
    caseId: sp.processo && UUID.test(sp.processo) ? sp.processo : undefined,
    status,
  }).catch(() => null);
  const people = await listCoworkPeople(ctx);
  if (!data) return <div className="mx-auto max-w-6xl"><RecordBackLink href="/cowork">Cowork</RecordBackLink><p className="text-sm text-danger">Filtros inválidos (o período pode ter no máximo 366 dias).</p></div>;
  const stats = [
    { label: "Tarefas abertas", value: data.totals.open },
    { label: "Em andamento", value: data.totals.inProgress },
    { label: "Aguardando", value: data.totals.waiting },
    { label: "Atrasadas", value: data.totals.overdue },
    { label: "Concluídas no período", value: data.totals.done },
    { label: "Reuniões no período", value: data.totals.meetings },
    ...(data.canHours ? [{ label: "Horas registradas", value: hours(data.totals.minutes) }] : []),
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <RecordBackLink href="/cowork">Cowork</RecordBackLink>
      <PageHeader title="Painel do trabalho" description="Acompanhe entregas, pendências, atrasos, horas e reuniões com base nos registros reais de Tarefas, Agenda, Horas e Reuniões. Mensagens e conversas diretas não entram aqui, e quantidade de mensagens não mede desempenho." />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-2" aria-label="Filtros do painel">
        <label className="text-xs text-muted">De<input type="date" name="de" defaultValue={data.from} className={`${sel} ml-1`} /></label>
        <label className="text-xs text-muted">Até<input type="date" name="ate" defaultValue={data.to} className={`${sel} ml-1`} /></label>
        <select name="pessoa" defaultValue={sp.pessoa ?? ""} aria-label="Pessoa" className={sel}><option value="">Todas as pessoas</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="equipe" defaultValue={sp.equipe ?? ""} aria-label="Equipe" className={sel}><option value="">Todas as equipes</option>{data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select name="dep" defaultValue={sp.dep ?? ""} aria-label="Departamento" className={sel}><option value="">Todos os departamentos</option>{COWORK_DEPARTMENTS.map((d) => <option key={d} value={d}>{COWORK_DEPARTMENT_LABEL[d]}</option>)}</select>
        <select name="situacao" defaultValue={sp.situacao ?? ""} aria-label="Situação" className={sel}><option value="">Todas as situações</option><option value="TODO">A fazer</option><option value="IN_PROGRESS">Em andamento</option><option value="WAITING">Aguardando</option><option value="OVERDUE">Atrasadas</option><option value="DONE">Concluídas</option></select>
        {sp.processo && UUID.test(sp.processo) ? <input type="hidden" name="processo" value={sp.processo} /> : null}
        <button type="submit" className="h-9 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-fg">Filtrar</button>
        <Link href="/cowork/painel" className="h-9 px-2 text-sm leading-9 text-muted underline">Limpar</Link>
      </form>
      {sp.processo ? <p className="mb-3 text-xs text-muted">Filtrado por um processo. <Link className="underline" href="/cowork/painel">Remover filtro</Link></p> : null}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="insights-stats">
        {stats.map((s) => (
          <Card key={s.label}><CardBody className="p-4"><p className="text-[11px] text-muted">{s.label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{s.value}</p></CardBody></Card>
        ))}
      </div>
      <Card className="mb-5">
        <CardHeader title="Por pessoa" description={`Período de ${formatYmd(data.from)} a ${formatYmd(data.to)}. Estado de trabalho baseado em tarefas, compromissos e reuniões com presença registrada.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm" data-testid="insights-table">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted"><tr className="border-b border-border">
              <th className="px-4 py-2 font-medium">Pessoa</th><th className="px-3 py-2 font-medium">Departamento</th><th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">A fazer</th><th className="px-3 py-2 text-right font-medium">Em andamento</th><th className="px-3 py-2 text-right font-medium">Aguardando</th><th className="px-3 py-2 text-right font-medium">Atrasadas</th><th className="px-3 py-2 text-right font-medium">Concluídas</th>
              {data.canHours ? <th className="px-3 py-2 text-right font-medium">Horas</th> : null}<th className="px-3 py-2 text-right font-medium">Reuniões</th><th className="px-3 py-2 text-right font-medium">Vindas do Cowork</th>
            </tr></thead>
            <tbody>
              {data.rows.length === 0 ? <tr><td colSpan={11} className="px-4 py-8 text-center text-muted">Ninguém corresponde aos filtros.</td></tr> : null}
              {data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border last:border-0" data-testid="insights-row">
                  <td className="px-4 py-2"><span className="font-medium">{r.name}</span>{r.jobTitle ? <span className="block text-xs text-muted">{r.jobTitle}</span> : null}</td>
                  <td className="px-3 py-2 text-muted">{r.departmentLabel}</td>
                  <td className="px-3 py-2">{WORK_STATE_LABEL[r.state]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.todo}</td><td className="px-3 py-2 text-right tabular-nums">{r.inProgress}</td><td className="px-3 py-2 text-right tabular-nums">{r.waiting}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.overdue ? "font-semibold text-danger" : ""}`}>{r.overdue}</td><td className="px-3 py-2 text-right tabular-nums">{r.done}</td>
                  {data.canHours ? <td className="px-3 py-2 text-right tabular-nums">{hours(r.minutes ?? 0)}</td> : null}
                  <td className="px-3 py-2 text-right tabular-nums">{r.meetings}</td><td className="px-3 py-2 text-right tabular-nums">{r.fromCowork}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Distribuição por departamento" />
          <CardBody>
            <ul className="space-y-2 text-sm">{data.departments.map((d) => <li key={d.label} className="flex justify-between gap-2"><span>{d.label} <span className="text-xs text-muted">({d.people})</span></span><span className="tabular-nums text-muted">{d.open} abertas · {d.overdue} atrasadas · {d.done} concluídas</span></li>)}</ul>
          </CardBody>
        </Card>
        <TaskList title="Atrasos" rows={data.overdue} empty="Nenhuma tarefa atrasada." />
        <TaskList title="Pendências (aguardando)" rows={data.waiting} empty="Nenhuma pendência aguardando." />
      </div>
      {!data.canHours ? <p className="mt-4 text-xs text-muted">Horas registradas aparecem para perfis com “Ver produtividade da equipe”.</p> : null}
    </div>
  );
}

function TaskList({ title, rows, empty }: { title: string; rows: { id: string; title: string; dueDate: string | null; assigneeName: string | null; case: { id: string; title: string } | null }[]; empty: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="p-0">
        {rows.length === 0 ? <p className="px-5 py-6 text-sm text-muted">{empty}</p> : (
          <ul className="divide-y divide-border">
            {rows.slice(0, 15).map((t) => (
              <li key={t.id}><Link href={`/tarefas/${t.id}`} className="block px-5 py-2.5 hover:bg-surface-2"><span className="block truncate text-sm">{t.title}</span><span className="block truncate text-xs text-muted">{[t.assigneeName ?? "Sem responsável", t.dueDate ? `prazo ${formatYmd(t.dueDate)}` : null, t.case?.title].filter(Boolean).join(" · ")}</span></Link></li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
