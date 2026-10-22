import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PackagesAdmin } from "@/modules/kanban/packages-ui";
import { can } from "@/server/context";
import { listActiveMembers } from "@/server/services/members";
import { listPackages } from "@/server/services/workflow-package.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Pacotes de tarefas" };

export default async function PackagesPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "tasks:read")) return <AccessDenied />;
  const [pkgs, members] = await Promise.all([listPackages(ctx), listActiveMembers(ctx)]);
  return (
    <PackagesAdmin
      canEdit={can(ctx, "organization:manage")}
      members={members}
      rows={pkgs.map((p) => ({ id: p.id, name: p.name, description: p.description ?? "", active: p.active, steps: p.steps.map((s) => ({ id: s.id, title: s.title, description: s.description ?? "", dueDays: s.dueDays, priority: s.priority, assigneeId: s.assigneeId ?? "", ask: s.ask ?? "" })) }))}
    />
  );
}
