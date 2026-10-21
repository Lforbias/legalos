import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { dateToYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { TaskForm } from "@/modules/tasks/task-form";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { listActiveMembers } from "@/server/services/members";
import { getTask } from "@/server/services/task.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar tarefa" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "tasks:write")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const t = await getTask(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!t) notFound();
  const [members, cases] = await Promise.all([listActiveMembers(ctx), can(ctx, "cases:read") ? listCaseOptions(ctx) : Promise.resolve([])]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar tarefa" />
      <TaskForm
        taskId={t.id}
        members={members}
        cases={cases}
        initialClientLabel={t.client?.name ?? ""}
        initial={{
          title: t.title, description: t.description ?? "", status: t.status, priority: t.priority,
          dueDate: t.dueDate ? dateToYmd(t.dueDate) : "", assigneeId: t.assigneeId ?? "", caseId: t.caseId ?? "", clientId: t.clientId ?? "",
        }}
      />
    </div>
  );
}
