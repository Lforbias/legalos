import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DeleteGoalButton, DistributionPanel, GoalForm } from "@/modules/metas/metas-ui";
import { can } from "@/server/context";
import { currentMonth, GOAL_METRICS, goalProgress, suggestDistribution, weightedWorkload } from "@/server/services/goals.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Metas e carga de trabalho" };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "productivity:read")) return <AccessDenied />;
  const q = (await searchParams).mes;
  const month = q && /^\d{4}-(0[1-9]|1[0-2])$/.test(q) ? q : currentMonth(ctx.timezone);
  const [prog, load, sug] = await Promise.all([goalProgress(ctx, month), weightedWorkload(ctx), suggestDistribution(ctx)]);
  const canSet = can(ctx, "organization:manage");
  const metrics = Object.entries(GOAL_METRICS).map(([key, v]) => ({ key, label: v.label }));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Metas e carga de trabalho" description="Metas mensais por pessoa e carga por peso (pontos do tipo de tarefa; sem tipo, 1 ponto). Os números vêm das tarefas, prazos e horas registrados." />
      <Link href="/equipe" className="text-sm text-primary-text hover:underline">← Equipe e produtividade</Link>
      <form className="flex items-end gap-2 text-sm" method="get">
        <label className="text-muted">Mês <input type="month" name="mes" defaultValue={month} className="ml-1 rounded-md border border-border bg-surface px-2 py-1" /></label>
        <button className="rounded-md border border-border px-3 py-1">Ver</button>
      </form>
      <Card>
        <CardHeader title={`Metas de ${month}`} />
        <CardBody className="space-y-4">
          {prog.rows.length === 0 ? <p className="text-sm text-muted">Nenhuma meta definida para este mês.</p> : null}
          <ul className="space-y-2 text-sm">
            {prog.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2">
                <span className="min-w-0 flex-1"><span className="font-medium">{r.name}</span> · {GOAL_METRICS[r.metric].label}</span>
                <span className="tabular-nums">{r.actual} / {r.target} {GOAL_METRICS[r.metric].unit}</span>
                <Badge tone={r.pct >= 100 ? "success" : r.pct >= 60 ? "warning" : "neutral"}>{r.pct}%</Badge>
                {canSet ? <DeleteGoalButton id={r.id} /> : null}
              </li>
            ))}
          </ul>
          {canSet ? <GoalForm month={month} members={prog.members} metrics={metrics} /> : <p className="text-xs text-muted">Só quem administra o escritório define metas.</p>}
        </CardBody>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Carga por peso" description="Tarefas em aberto por pessoa, somando os pontos." />
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Pessoa</th><th className="px-3 py-2 font-medium">Tarefas abertas</th><th className="px-3 py-2 font-medium">Pontos</th></tr></thead>
          <tbody>
            {load.members.map((m) => <tr key={m.userId} className="border-b border-border last:border-0"><td className="px-4 py-2.5">{m.name}</td><td className="px-3 py-2.5 tabular-nums">{m.openTasks}</td><td className="px-3 py-2.5 tabular-nums">{m.points}</td></tr>)}
          </tbody>
        </table>
        <p className="border-t border-border px-4 py-2 text-xs text-muted">Sem responsável: {load.unassigned.count} tarefa(s), {load.unassigned.points} ponto(s).</p>
      </Card>
      <Card>
        <CardHeader title="Distribuir tarefas sem responsável" description="Sugestão para você conferir e confirmar." />
        <CardBody><DistributionPanel key={sug.map((s) => s.taskId).join(",")} suggestions={sug} members={prog.members} canApply={can(ctx, "tasks:write")} /></CardBody>
      </Card>
    </div>
  );
}
