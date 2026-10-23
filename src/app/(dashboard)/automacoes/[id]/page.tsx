import { conditionsSchema, EMPTY_CONDITIONS } from "@/modules/workflows/conditions";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { RuleForm } from "@/modules/workflows/rule-form";
import { can } from "@/server/context";
import { listActiveMembers } from "@/server/services/members";
import { getRule } from "@/server/services/workflow.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar regra" };

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "workflows:manage")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const r = await getRule(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar regra" description="Alterações valem para os próximos disparos." />
      <RuleForm
        ruleId={r.id}
        members={await listActiveMembers(ctx)}
        initial={{ conditions: conditionsSchema.safeParse(r.conditions).data ?? EMPTY_CONDITIONS, noticeAssigneeId: r.noticeAssigneeId ?? "", noticeTags: r.noticeTags.join(", "), name: r.name, trigger: r.trigger, taskTitle: r.taskTitle, taskDescription: r.taskDescription ?? "", dueDays: String(r.dueDays), priority: r.priority, assigneeMode: r.assigneeMode, assigneeId: r.assigneeId ?? "", active: r.active }}
      />
    </div>
  );
}
