import { TASK_STATUSES, TASK_STATUS_LABEL } from "@/modules/tasks/schemas";
import type { Activity } from "@/server/services/activity.service";
import { ActivityCard } from "./activity-card";
export function ActivityBoard({ items }: { items: Activity[] }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{TASK_STATUSES.map(status => {
    const rows = items.filter(i => i.status === status);
    return <section key={status} aria-label={TASK_STATUS_LABEL[status]} className="min-w-0 rounded-lg border border-border bg-surface-2 p-2"><h2 className="mb-3 flex justify-between gap-2 text-sm font-semibold">{TASK_STATUS_LABEL[status]}<span>{rows.length}</span></h2><div className="space-y-2">{rows.map(i => <ActivityCard key={`${i.kind}:${i.id}`} item={i} controls />)}{!rows.length ? <p className="text-xs text-muted">Nenhuma atividade.</p> : null}</div></section>;
  })}</div>;
}
