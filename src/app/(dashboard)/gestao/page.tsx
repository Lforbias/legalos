import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates/format";
import { todayYmd } from "@/lib/dates/ymd";
import { BoardAdmin, KanbanBoardView, NewBoardForm } from "@/modules/kanban/kanban-ui";
import { can } from "@/server/context";
import { getBoard, listBoards } from "@/server/services/kanban.service";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Gestão" };

export default async function ManagementPage({ searchParams }: { searchParams: Promise<{ b?: string; month?: string; a?: string; q?: string; closed?: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "tasks:read")) return <AccessDenied />;
  const sp = await searchParams;
  const boards = await listBoards(ctx);
  const canAdmin = can(ctx, "organization:manage");
  const current = boards.find((b) => b.id === sp.b) ?? boards[0] ?? null;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month : undefined;
  const members = await listActiveMembers(ctx);
  const data = current ? await getBoard(ctx, current.id, { month, assigneeId: sp.a || undefined, q: sp.q, includeClosed: sp.closed === "1" }) : null;
  const tz = organization.timezone;
  const today = todayYmd(tz);
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title="Gestão" description="Quadros do escritório para acompanhar contratos, encerramentos e o que mais precisar. Para rotinas prontas, use os pacotes de tarefas." />
      {boards.length === 0 ? <Alert tone="info">Ainda não há quadros. {canAdmin ? "Crie o primeiro abaixo." : "Peça a quem administra o escritório para criar um quadro."}</Alert> : null}
      {boards.length > 0 ? (
        <nav aria-label="Quadros" className="flex flex-wrap gap-2">
          {boards.map((b) => (
            <Link key={b.id} href={`/gestao?b=${b.id}`} aria-current={b.id === current?.id ? "page" : undefined} className={`rounded-md border px-3 py-1.5 text-sm ${b.id === current?.id ? "border-primary bg-surface-2 font-medium" : "border-border text-muted hover:text-fg"}`}>
              {b.name} <span className="text-xs text-muted">({b.open})</span>
            </Link>
          ))}
        </nav>
      ) : null}
      {current && data ? (
        <>
          <Card>
            <CardBody>
              <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros do quadro">
                <input type="hidden" name="b" value={current.id} />
                <Field label="Mês do prazo" htmlFor="f-month"><Input id="f-month" type="month" name="month" defaultValue={month ?? ""} /></Field>
                <Field label="Responsável" htmlFor="f-a"><Select id="f-a" name="a" defaultValue={sp.a ?? ""}><option value="">Todos</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
                <Field label="Buscar" htmlFor="f-q"><Input id="f-q" name="q" defaultValue={sp.q ?? ""} /></Field>
                <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="closed" value="1" defaultChecked={sp.closed === "1"} /> mostrar concluídos</label>
                <Button type="submit" size="sm" variant="secondary">Filtrar</Button>
              </form>
            </CardBody>
          </Card>
          <KanbanBoardView
            boardId={current.id}
            columns={data.columns.map((c) => ({ id: c.id, name: c.name, isDone: c.isDone }))}
            canWrite={can(ctx, "tasks:write")}
            members={members}
            cards={data.cards.map((c) => {
              const due = c.dueDate ? c.dueDate.toISOString().slice(0, 10) : null;
              return { id: c.id, columnId: c.columnId, title: c.title, assigneeName: c.assigneeName, dueLabel: c.dueDate ? formatDate(c.dueDate, tz) : null, overdue: !!due && due < today, caseTitle: c.case?.title ?? null, clientName: c.client?.name ?? null, closed: !!c.closedAt };
            })}
          />
          {canAdmin ? <BoardAdmin boardId={current.id} name={current.name} columns={data.columns.map((c) => ({ id: c.id, name: c.name, isDone: c.isDone }))} /> : null}
        </>
      ) : null}
      {canAdmin ? <Card><CardBody><NewBoardForm /></CardBody></Card> : null}
    </div>
  );
}
