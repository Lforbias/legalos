import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { RuleControls } from "@/modules/workflows/rule-controls";
import { TRIGGER_LABEL, type WorkflowTriggerKey } from "@/modules/workflows/schemas";
import { can } from "@/server/context";
import { listRecentRuns, listRules } from "@/server/services/workflow.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Automações" };

const RUN_LABEL = { CREATED: "Tarefa criada", SKIPPED: "Ignorada", FAILED: "Falhou" } as const;

export default async function AutomationsPage() {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "workflows:manage")) return <AccessDenied />;
  const [rules, runs] = await Promise.all([listRules(ctx), listRecentRuns(ctx)]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Automações"
        description="Regras com condições E/OU: crie tarefas, distribua e etiquete intimações. Cada regra roda uma vez por item e fica registrada."
        actions={<Link href="/automacoes/nova" className={bv({})}><Plus className="h-4 w-4" aria-hidden /> Nova regra</Link>}
      />
      <Card>
        <CardHeader title="Regras" />
        {rules.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhuma regra cadastrada.</p> : null}
        <ul className="divide-y divide-border">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium"><Link href={`/automacoes/${r.id}`} className="text-primary-text hover:underline">{r.name}</Link> {!r.active ? <Badge tone="warning">inativa</Badge> : null}</p>
                <p className="text-xs text-muted">{TRIGGER_LABEL[r.trigger as WorkflowTriggerKey]} → criar tarefa “{r.taskTitle}” em {r.dueDays} dia(s)</p>
              </div>
              <RuleControls id={r.id} active={r.active} />
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Execuções recentes" description="As 50 mais recentes." />
        {runs.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhuma execução ainda.</p> : null}
        <ul className="divide-y divide-border">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span>{r.rule.name} <span className="text-xs text-muted">— {r.message}</span></span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {formatDateTime(r.createdAt, organization.timezone)}
                <Badge tone={r.status === "CREATED" ? "success" : r.status === "FAILED" ? "danger" : "neutral"}>{RUN_LABEL[r.status]}</Badge>
                {r.taskId && can(ctx, "tasks:read") ? <Link href={`/tarefas/${r.taskId}`} className="text-primary-text hover:underline">ver tarefa</Link> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
