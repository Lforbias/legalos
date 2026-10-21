import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, buttonVariants as bv } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Prazos"
        description="Prazos processuais cadastrados manualmente. Cada prazo só vale como definitivo depois da validação por um profissional habilitado."
        actions={
          <div className="flex gap-2">
            <Link href="/agenda" className={bv({ variant: "secondary" })}>Ver na agenda</Link>
            {canWrite ? (
              <Link href="/prazos/novo" className={buttonVariants({})}>
                <Plus className="h-4 w-4" aria-hidden /> Novo prazo
              </Link>
            ) : null}
          </div>
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Filtrar prazos">
        <div>
          <label htmlFor="status" className="sr-only">Situação</label>
          <Select id="status" name="status" defaultValue={status ?? ""} className="w-52">
            <option value="">Em aberto</option>
            {DEADLINE_STATUSES.map((s) => (
              <option key={s} value={s}>{DEADLINE_STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="responsavel" className="sr-only">Responsável</label>
          <Select id="responsavel" name="responsavel" defaultValue={sp.responsavel ?? ""} className="w-56">
            <option value="">Todos os responsáveis</option>
            <option value="eu">Meus prazos</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="atrasados" value="1" defaultChecked={overdue} className="h-4 w-4" /> Só vencidos
        </label>
        <button type="submit" className={bv({ variant: "secondary" })}>Filtrar</button>
      </form>
      {drafts > 0 ? <p className="mb-2 text-xs text-warning">{drafts} prazo(s) nesta lista ainda aguardam validação humana.</p> : null}
      {result.truncated ? <p className="mb-2 text-xs text-warning">Mostrando os 300 primeiros de {result.total} prazos.</p> : null}

      {result.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhum prazo encontrado.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de prazos</caption>
            <thead>
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
                const st = deadlineDue(due, d.status, ctx.timezone);
                return (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">
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
