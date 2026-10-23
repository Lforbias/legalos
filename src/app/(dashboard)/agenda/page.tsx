import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { ActivityCard } from "@/modules/activities/activity-card";
import { addDays, isYmd, todayYmd, weekday } from "@/lib/dates/ymd";
import { can } from "@/server/context";
import { activityFilterSchema, listActivities } from "@/server/services/activity.service";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";
export const metadata: Metadata = { title: "Agenda" };
const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const WEEK = ["dom","seg","ter","qua","qui","sex","sáb"];
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ mes?: string; data?: string; visao?: string; tipo?: string; responsavel?: string; closed?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx,"deadlines:read") && !can(ctx,"tasks:read")) return <AccessDenied />;
  const sp=await searchParams, today=todayYmd(ctx.timezone);
  const selected=sp.data && isYmd(sp.data) ? sp.data : /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? `${sp.mes}-01` : today;
  const view=["dia","semana","mes","lista"].includes(sp.visao ?? "") ? sp.visao! : "mes";
  const ym=selected.slice(0,7), first=`${ym}-01`;
  const from=view==="dia" ? selected : view==="semana" ? addDays(selected,-((weekday(selected)+6)%7)) : view==="mes" ? addDays(first,-weekday(first)) : selected;
  const length=view==="dia" ? 1 : view==="semana" ? 7 : view==="mes" ? 42 : 31;
  const to=addDays(from,length-1);
  const filters=activityFilterSchema.safeParse({ from,to,kind:sp.tipo || undefined,assigneeId:sp.responsavel || undefined,includeClosed:sp.closed==="1" });
  const [data,members]=await Promise.all([listActivities(ctx,filters.success ? filters.data : {from,to}),listActiveMembers(ctx)]);
  const days=Array.from({length},(_,i)=>addDays(from,i));
  const shifted=(direction:number) => view==="mes" ? new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1+direction,1)).toISOString().slice(0,10) : addDays(selected,direction*(view==="dia"?1:view==="semana"?7:31));
  const href=(date:string) => `/agenda?${new URLSearchParams({data:date,visao:view,...(sp.tipo?{tipo:sp.tipo}:{}),...(sp.responsavel?{responsavel:sp.responsavel}:{}),...(sp.closed?{closed:sp.closed}:{})})}`;
  return <div className="mx-auto max-w-7xl space-y-4">
    <PageHeader title="Agenda" description="Tarefas, prazos e compromissos: os mesmos registros da gestão e dos processos." actions={<div className="flex flex-wrap gap-2"><Link href="/gestao" className={buttonVariants({variant:"secondary"})}>Ver no quadro</Link>{can(ctx,"deadlines:read") ? <Link href="/prazos" className={buttonVariants({variant:"secondary"})}>Lista de prazos</Link> : null}{can(ctx,"tasks:write") ? <Link href="/tarefas/nova" className={buttonVariants({variant:"secondary"})}>Nova tarefa</Link> : null}{can(ctx,"deadlines:write") || can(ctx,"tasks:write") ? <Link href={`/agenda/novo?data=${selected}`} className={buttonVariants({})}>Novo compromisso</Link> : null}</div>} />
    <form className="flex flex-wrap items-end gap-3" aria-label="Filtrar agenda">
      <Field label="Visualização" htmlFor="av"><Select id="av" name="visao" defaultValue={view}><option value="mes">Mês</option><option value="semana">Semana</option><option value="dia">Dia</option><option value="lista">Lista</option></Select></Field>
      <Field label="Data" htmlFor="ad"><Input id="ad" name="data" type="date" defaultValue={selected} /></Field>
      <Field label="Tipo" htmlFor="ak"><Select id="ak" name="tipo" defaultValue={sp.tipo ?? ""}><option value="">Todos</option><option value="TASK">Tarefas</option><option value="EVENT">Compromissos</option><option value="DEADLINE">Prazos</option></Select></Field>
      <Field label="Responsável" htmlFor="ar"><Select id="ar" name="responsavel" defaultValue={sp.responsavel ?? ""}><option value="">Todos</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
      <label className="flex gap-2 pb-2 text-sm"><input name="closed" type="checkbox" value="1" defaultChecked={sp.closed==="1"} />Incluir concluídos/cancelados</label><button className={buttonVariants({variant:"secondary"})}>Aplicar</button>
    </form>
    {!filters.success ? <Alert tone="error">Filtro inválido; mostrando todos os tipos e responsáveis no período.</Alert> : null}
    <div className="flex flex-wrap items-center gap-3"><Link href={href(shifted(-1))} aria-label={view==="mes"?"Mês anterior":"Período anterior"} className={buttonVariants({variant:"secondary"})}>Anterior</Link><h2 className="text-base font-semibold capitalize">{MONTHS[Number(ym.slice(5,7))-1]} de {ym.slice(0,4)}</h2><Link href={href(shifted(1))} aria-label={view==="mes"?"Próximo mês":"Próximo período"} className={buttonVariants({variant:"secondary"})}>Próximo</Link><Link href={href(today)} className={buttonVariants({variant:"ghost"})}>Hoje</Link></div>
    <p className="text-xs text-muted">{data.total} atividades com data no período. {data.truncated ? "Exibindo até 300; refine os filtros." : ""} Tarefas sem data ficam na lista e no quadro. Prazos em rascunho aguardam validação.</p>
    <div className={view==="mes" || view==="semana" ? "grid gap-2 md:grid-cols-7" : "space-y-3"}>{days.map(day=>{
      const items=data.items.filter(i=>i.date===day);
      if (view==="lista" && !items.length) return null;
      return <section key={day} aria-label={day} className={`min-w-0 rounded-md border border-border p-2 ${day===today?"border-primary bg-info-bg":"bg-surface"} ${view==="mes" && !day.startsWith(ym)?"opacity-60":""}`}><h3 className="mb-2 text-xs font-semibold">{WEEK[weekday(day)]} · {day.slice(8)}/{day.slice(5,7)}</h3><div className="space-y-2">{items.map(i=><ActivityCard key={`${i.kind}:${i.id}`} item={i} />)}{!items.length?<p className="text-xs text-muted">Sem atividades.</p>:null}</div></section>;
    })}</div>{!data.total ? <p className="py-8 text-center text-sm text-muted">Nenhuma atividade no período.</p> : null}
  </div>;
}
