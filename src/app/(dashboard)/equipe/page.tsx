import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatYmd, todayYmd } from "@/lib/dates/ymd";
import { formatMinutes } from "@/modules/timesheet/schemas";
import { DeleteTimeButton } from "@/modules/timesheet/delete-time-button";
import { TimeForm } from "@/modules/timesheet/time-form";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { listMyTime, teamWorkload } from "@/server/services/team.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Equipe e produtividade" };

export default async function TeamPage() {
  const { ctx } = await requireTenant();
  const canTeam = can(ctx, "productivity:read");
  const canLog = can(ctx, "tasks:write");
  if (!canTeam && !canLog) return <AccessDenied />;
  const [team, mine, cases] = await Promise.all([
    canTeam ? teamWorkload(ctx) : null,
    can(ctx, "tasks:read") ? listMyTime(ctx) : [],
    canLog && can(ctx, "cases:read") ? listCaseOptions(ctx) : [],
  ]);
  const myTotal = mine.reduce((s, e) => s + e.minutes, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Equipe e produtividade" description="Carga de trabalho por responsável e registro de horas. Os números vêm de tarefas, prazos e lançamentos reais; itens de processos sigilosos que você não vê não entram na contagem." />

      {team ? (
        <Card className="overflow-x-auto">
          <CardHeader title="Carga de trabalho" description={`Em aberto hoje; horas dos últimos ${team.days} dias.`} />
          <table className="w-full text-sm">
            <caption className="sr-only">Carga de trabalho por membro</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Membro</th>
                <th scope="col" className="px-3 py-2 font-medium">Tarefas abertas</th>
                <th scope="col" className="px-3 py-2 font-medium">Tarefas atrasadas</th>
                <th scope="col" className="px-3 py-2 font-medium">Prazos abertos</th>
                <th scope="col" className="px-3 py-2 font-medium">Próx. 7 dias</th>
                <th scope="col" className="px-3 py-2 font-medium">Vencidos</th>
                <th scope="col" className="px-3 py-2 font-medium">Sem validação</th>
                <th scope="col" className="px-3 py-2 font-medium">Horas</th>
              </tr>
            </thead>
            <tbody>
              {team.members.map((m) => (
                <tr key={m.userId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/tarefas?responsavel=${m.userId}`} className="font-medium hover:underline">{m.name}</Link>
                    <p className="text-xs text-muted">{m.roleName}</p>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{m.openTasks}</td>
                  <td className="px-3 py-2.5 tabular-nums">{m.overdueTasks ? <Badge tone="danger">{m.overdueTasks}</Badge> : 0}</td>
                  <td className="px-3 py-2.5 tabular-nums">{m.openDeadlines}</td>
                  <td className="px-3 py-2.5 tabular-nums">{m.next7Deadlines ? <Badge tone="warning">{m.next7Deadlines}</Badge> : 0}</td>
                  <td className="px-3 py-2.5 tabular-nums">{m.overdueDeadlines ? <Badge tone="danger">{m.overdueDeadlines}</Badge> : 0}</td>
                  <td className="px-3 py-2.5 tabular-nums">{m.draftDeadlines}</td>
                  <td className="px-3 py-2.5 tabular-nums">{m.minutes ? formatMinutes(m.minutes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-muted">
            Sem responsável: {team.unassigned.tasks} tarefa(s) e {team.unassigned.deadlines} prazo(s) em aberto.
          </p>
        </Card>
      ) : null}

      {canLog ? (
        <Card>
          <CardHeader title="Registrar horas" description="Lançamentos são pessoais: cada pessoa registra e exclui apenas as próprias horas." />
          <CardBody>
            <TimeForm today={todayYmd(ctx.timezone)} cases={cases} />
          </CardBody>
        </Card>
      ) : null}

      {can(ctx, "tasks:read") ? (
        <Card>
          <CardHeader title="Minhas horas (30 dias)" description={`Total: ${formatMinutes(myTotal)}`} />
          {mine.length === 0 ? (
            <CardBody><p className="text-sm text-muted">Nenhum lançamento nos últimos 30 dias.</p></CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {mine.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-muted">{formatYmd(e.entryDate.toISOString().slice(0, 10))}</span>
                  <span className="w-14 shrink-0 font-medium tabular-nums">{formatMinutes(e.minutes)}</span>
                  <span className="min-w-0 flex-1">{e.description}{e.caseTitle ? <span className="text-muted"> · {e.caseTitle}</span> : null}</span>
                  <DeleteTimeButton id={e.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
