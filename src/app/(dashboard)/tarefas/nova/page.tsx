import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { EMPTY_TASK } from "@/modules/tasks/schemas";
import { TaskForm } from "@/modules/tasks/task-form";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { listActiveMembers } from "@/server/services/members";
import { resolveSourceNotice } from "@/server/services/notice.service";
import { NotFoundError } from "@/lib/permissions/check";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Nova tarefa" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ processo?: string; intimacao?: string; titulo?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "tasks:write")) return <AccessDenied />;
  const sp = await searchParams;
  const [members, cases] = await Promise.all([listActiveMembers(ctx), can(ctx, "cases:read") ? listCaseOptions(ctx) : Promise.resolve([])]);
  const notice = /^[0-9a-f-]{36}$/i.test(sp.intimacao ?? "") && (can(ctx, "inbox:read") || (boxV3PreviewEnabled() && ctx.permissions.has("inbox:read"))) ? await resolveSourceNotice(ctx, sp.intimacao, boxV3PreviewEnabled() ? "v3" : "legacy").catch((e) => (e instanceof NotFoundError ? undefined : Promise.reject(e))) : undefined;
  const caseId = cases.some((c) => c.id === (sp.processo ?? notice?.caseId)) ? ((sp.processo ?? notice?.caseId) as string) : "";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova tarefa" />
      <TaskForm
        noticeId={notice?.id}
        initial={{ ...EMPTY_TASK, caseId, assigneeId: ctx.userId, title: sp.titulo?.trim() ? sp.titulo.trim().slice(0, 200) : notice ? `Providência: ${notice.title}`.slice(0, 200) : "" }}
        members={members}
        cases={cases}
      />
    </div>
  );
}
