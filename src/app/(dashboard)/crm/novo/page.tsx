import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { LeadForm } from "@/modules/crm/lead-form";
import { EMPTY_LEAD } from "@/modules/crm/schemas";
import { can } from "@/server/context";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo lead" };

export default async function NewLeadPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "crm:write")) return <AccessDenied />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo lead" />
      <LeadForm initial={EMPTY_LEAD} members={await listActiveMembers(ctx)} />
    </div>
  );
}
