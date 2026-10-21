import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db/client";
import { dateToYmd } from "@/lib/dates/ymd";
import { uuidSchema } from "@/lib/validation/common";
import { ProposalForm } from "@/modules/crm/proposal-form";
import { EMPTY_PROPOSAL } from "@/modules/crm/schemas";
import { can } from "@/server/context";
import { getLead } from "@/server/services/crm.service";
import { NotFoundError } from "@/lib/permissions/check";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Proposta" };

/** `pid` = "nova" cria; um UUID edita (somente rascunho). */
export default async function ProposalPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "crm:write")) return <AccessDenied />;
  const p = await params;
  const leadId = uuidSchema.safeParse(p.id);
  if (!leadId.success) notFound();
  const data = await getLead(ctx, leadId.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!data) notFound();
  if (p.pid === "nova") {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Nova proposta" description={data.lead.name} />
        <ProposalForm leadId={leadId.data} initial={EMPTY_PROPOSAL} />
      </div>
    );
  }
  const pid = uuidSchema.safeParse(p.pid);
  if (!pid.success) notFound();
  const prop = await db.proposal.findFirst({ where: { id: pid.data, leadId: leadId.data, organizationId: ctx.organizationId, deletedAt: null } });
  if (!prop) notFound();
  if (prop.status !== "DRAFT") redirect(`/crm/${leadId.data}`);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar proposta" description={data.lead.name} />
      <ProposalForm leadId={leadId.data} proposalId={prop.id} initial={{ title: prop.title, amount: prop.amount.toString().replace(".", ","), description: prop.description ?? "", validUntil: prop.validUntil ? dateToYmd(prop.validUntil) : "" }} />
    </div>
  );
}
