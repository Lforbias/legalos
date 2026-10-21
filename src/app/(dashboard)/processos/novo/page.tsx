import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { CaseForm, EMPTY_CASE } from "@/modules/cases/case-form";
import { can } from "@/server/context";
import { listAssignableMembers } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo processo" };

export default async function NewCasePage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:write")) return <AccessDenied />;
  const members = await listAssignableMembers(ctx);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Novo processo" description="O número CNJ é validado pelo dígito verificador e não pode se repetir no escritório." />
      <CaseForm initial={EMPTY_CASE} members={members} />
    </div>
  );
}
