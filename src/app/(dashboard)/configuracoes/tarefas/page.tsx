import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { TaskLabelsAdmin, TaskTypesAdmin } from "@/modules/tasks/extras-ui";
import { can } from "@/server/context";
import { listTaskLabels, listTaskTypes } from "@/server/services/task-extras.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Tipos e etiquetas de tarefa" };

export default async function TaskSettingsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "tasks:read")) return <AccessDenied />;
  const [types, labels] = await Promise.all([listTaskTypes(ctx), listTaskLabels(ctx)]);
  const canEdit = can(ctx, "organization:manage");
  return (
    <div className="space-y-4">
      <TaskTypesAdmin canEdit={canEdit} rows={types.map((t) => ({ id: t.id, name: t.name, points: t.points }))} />
      <TaskLabelsAdmin canEdit={canEdit} rows={labels.map((l) => ({ id: l.id, name: l.name, color: l.color }))} />
    </div>
  );
}
