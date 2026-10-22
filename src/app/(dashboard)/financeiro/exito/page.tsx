import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { formatMoneyBR } from "@/lib/validation/money";
import { ContractsPanel } from "@/modules/finance/fee-ui";
import { can } from "@/server/context";
import { listFeeContracts } from "@/server/services/fee-charge.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Contratos de êxito" };

export default async function ExitoPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const [data, clients] = await Promise.all([listFeeContracts(ctx), db.client.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 500 })]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Contratos de êxito" description={`Honorários que só entram quando o processo render. Previsão dos contratos ativos com base estimada: ${formatMoneyBR(data.expectedTotal)}.`} />
      <Card><CardBody>
        <ContractsPanel canWrite={can(ctx, "finance:write")} clients={clients} rows={data.items.map((r) => ({ id: r.id, title: r.title, clientName: r.clientName, percent: r.percent?.toString() ?? null, fixedAmount: r.fixedAmount?.toString() ?? null, baseNote: r.baseNote, status: r.status, expected: r.expected, entryId: r.entryId, caseId: r.caseId }))} />
      </CardBody></Card>
    </div>
  );
}
