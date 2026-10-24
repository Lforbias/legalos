"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Alert } from "@/components/ui/alert";
import { formatYmd } from "@/lib/dates/ymd";
import { TASK_STATUSES, TASK_STATUS_LABEL } from "@/modules/tasks/schemas";
import { useRun } from "@/modules/kanban/use-run";
import type { Activity } from "@/server/services/activity.service";
import { activityStatusAction } from "./actions";
export const ACTIVITY_LABELS = { TASK: "Tarefa", EVENT: "Compromisso", DEADLINE: "Prazo" };
export function ActivityCard({ item, controls = false }: { item: Activity; controls?: boolean }) {
  const { run, pending, error } = useRun();
  return <article className="min-w-0 rounded-md border border-border bg-surface p-2.5 text-sm" data-testid="activity-card">
    <div className="mb-1 flex flex-wrap items-center gap-1"><Badge>{ACTIVITY_LABELS[item.kind]}</Badge>{item.originalStatus === "DRAFT" ? <Badge tone="warning">Aguardando validação</Badge> : null}{item.status === "DONE" ? <Badge tone="success">Concluído</Badge> : null}</div>
    <Link href={item.href} className="block break-words font-medium hover:underline">{item.title}</Link>
    <p className="mt-1 text-xs text-muted">{item.date ? formatYmd(item.date) : "Sem data"}{item.time ? ` · ${item.time}` : ""} · {item.assigneeName ?? "Sem responsável"}</p>
    {item.caseTitle ? <p className="mt-1 truncate text-xs text-muted">{item.caseTitle}</p> : null}
    {error ? <Alert tone="error">{error}</Alert> : null}
    {controls && item.canWrite && item.kind !== "DEADLINE" ? <Select className="mt-2 h-8 text-xs" aria-label={`Situação de ${item.title}`} disabled={pending} value={item.status} onChange={e => run(() => activityStatusAction(item.kind,item.id,e.target.value))}>{TASK_STATUSES.map(s => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}</Select> : null}
    {controls && item.canWrite && item.kind === "DEADLINE" && item.originalStatus === "VALIDATED" ? <div className="mt-2"><ConfirmAction label="Cumprir prazo" confirmLabel="Confirmar cumprimento" description="Confirme que a providência deste prazo foi cumprida." action={() => activityStatusAction(item.kind,item.id,"DONE")} /></div> : null}
  </article>;
}
