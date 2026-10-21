import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { dateToYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { LeadForm } from "@/modules/crm/lead-form";
import { can } from "@/server/context";
import { getLead } from "@/server/services/crm.service";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar lead" };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "crm:write")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getLead(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!data) notFound();
  const l = data.lead;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar lead" description={l.name} />
      <LeadForm
        leadId={l.id}
        members={await listActiveMembers(ctx)}
        initial={{
          name: l.name, type: l.type, email: l.email ?? "", phone: l.phone ?? "", source: l.source ?? "", interest: l.interest ?? "",
          estimatedValue: l.estimatedValue ? l.estimatedValue.toString().replace(".", ",") : "", ownerId: l.ownerId ?? "",
          nextActionDate: l.nextActionDate ? dateToYmd(l.nextActionDate) : "", notes: l.notes ?? "",
        }}
      />
    </div>
  );
}
