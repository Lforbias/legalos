import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { FilterPanel } from "@/components/layout/filter-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, buttonVariants as bv } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/form";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { DEADLINE_STATUSES, DEADLINE_STATUS_LABEL } from "@/modules/deadlines/schemas";
import { deadlineDue, DUE_BADGE, dueText, STATUS_TONE } from "@/modules/deadlines/tone";
import { can } from "@/server/context";
import { listDeadlines } from "@/server/services/deadline.service";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Prazos" };

type SP = { status?: string; responsavel?: string; atrasados?: string };

export default async function DeadlinesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "deadlines:read")) return <AccessDenied />;
  const sp = await searchParams;
  const status = (DEADLINE_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof DEADLINE_STATUSES)[number]) : undefined;
  const responsibleId = sp.responsavel === "eu" ? ctx.userId : /^[0-9a-f-]{36}$/i.test(sp.responsavel ?? "") ? sp.responsavel : undefined;
  const overdue = sp.atrasados === "1";
  const [result, members] = await Promise.all([listDeadlines(ctx, { status, responsibleId, overdue }), listActiveMembers(ctx)]);
  const canWrite = can(ctx, "deadlines:write");
  const drafts = result.items.filter((d) => d.status === "DRAFT").length;
  const dueStates = new Map(result.items.map((d) => [d.id, deadlineDue(dateToYmd(d.dueDate), d.status, ctx.timezone)]));
  const summaries = [
    { label: "Vencidos", count: [...dueStates.values()].filter((d) => d.state === "overdue").length, color: "text-danger" },
    { label: "Vencem hoje", count: [...dueStates.values()].filter((d) => d.state === "today").length, color: "text-warning" },
    { label: "Aguardam validação", count: drafts, color: "text-fg" },
  ];
  const filtered = Boolean(status || responsibleId || overdue);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Prazos"
        description="Acompanhe os vencimentos e a validação dos prazos do escritório."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/agenda" className={bv({ variant: "secondary" })}>Ver na agenda</Link>
            {canWrite ? (
              <Link href="/prazos/novo" className={buttonVariants({})}>
                <Plus className="h-4 w-4" aria-hidden /> Novo prazo
              </Link>
            ) : null}
          </div>
        }
      />
      <section aria-label="Prazos na lista atual" className="mb-5">
        <p className="mb-2 text-xs text-muted">Na lista atual{result.truncated ? " · primeiros 300 registros" : ""}</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {summaries.map((item) => <Card key={item.label} className="px-3 py-4 sm:px-5"><p className="min-h-8 text-[11px] font-medium text-muted sm:min-h-0 sm:text-xs">{item.label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl ${item.count ? item.color : "text-muted"}`}>{item.count}</p></Card>)}
        </div>
      </section>
      <div className="mb-5"><FilterPanel label="Filtros de prazos" activeCount={[status, responsibleId, overdue].filter(Boolean).length}>
      <form method="get" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]" role="search" aria-label="Filtrar prazos">
        <div>
          <label htmlFor="status" className="mb-1.5 block text-xs font-medium text-muted">Situação</label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">Em aberto</option>
            {DEADLINE_STATUSES.map((s) => (
              <option key={s} value={s}>{DEADLINE_STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="responsavel" className="mb-1.5 block text-xs font-medium text-muted">Responsável</label>
          <Select id="responsavel" name="responsavel" defaultValue={sp.responsavel ?? ""}>
            <option value="">Todos os responsáveis</option>
            <option value="eu">Meus prazos</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted">
          <input type="checkbox" name="atrasados" value="1" defaultChecked={overdue} className="h-4 w-4 accent-primary" /> Só vencidos
        </label>
        <button type="submit" className={bv({ variant: "secondary" })}>Aplicar filtros</button>
        {filtered ? <Link href="/prazos" className={bv({ variant: "ghost" })}>Limpar</Link> : null}
      </form>
      </FilterPanel></div>
      {drafts > 0 ? <div className="mb-4"><Alert tone="warning">{drafts} prazo(s) nesta lista aguardam validação por um profissional habilitado. Abra o prazo para revisar a contagem e validar.</Alert></div> : null}
      {result.truncated ? <p className="mb-2 text-xs text-warning">Mostrando os 300 primeiros de {result.total} prazos.</p> : null}

      {result.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted"><p>{filtered ? "Nenhum prazo encontrado com esses filtros." : "Nenhum prazo em aberto."}</p>{filtered ? <Link href="/prazos" className="mt-3 inline-block font-medium text-fg underline underline-offset-4">Limpar filtros</Link> : null}</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de prazos</caption>
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Data fatal</th>
                <th scope="col" className="px-3 py-2 font-medium">Prazo</th>
                <th scope="col" className="px-3 py-2 font-medium">Processo</th>
                <th scope="col" className="px-3 py-2 font-medium">Responsável</th>
                <th scope="col" className="px-3 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((d) => {
                const due = dateToYmd(d.dueDate);
                const st = dueStates.get(d.id)!;
                return (
                  <tr key={d.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Badge tone={DUE_BADGE[st.state]}>{formatYmd(due)}</Badge>
                      {dueText(st.state, st.days) ? <p className="mt-0.5 text-[11px] text-muted">{dueText(st.state, st.days)}</p> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/prazos/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                      {d.kind ? <p className="text-xs text-muted">{d.kind}</p> : null}
                    </td>
                    <td className="px-3 py-2.5"><Link href={`/processos/${d.case.id}`} className="hover:underline">{d.case.title}</Link></td>
                    <td className="px-3 py-2.5 text-muted">{d.responsibleName ?? "—"}</td>
                    <td className="px-3 py-2.5"><Badge tone={STATUS_TONE[d.status]}>{DEADLINE_STATUS_LABEL[d.status]}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
