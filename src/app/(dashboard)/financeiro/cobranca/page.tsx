import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { FeeConfigPanel } from "@/modules/finance/fee-ui";
import { can } from "@/server/context";
import { getFeeAsaasStatus } from "@/server/services/fee-charge.service";
import { listAccounts } from "@/server/services/finance.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Cobrança por Pix e boleto" };

export default async function CobrancaPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:manage")) return <AccessDenied />;
  const [status, accounts] = await Promise.all([getFeeAsaasStatus(ctx), listAccounts(ctx)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Cobrança por Pix e boleto" description="Gere Pix e boleto de honorários na conta Asaas do escritório. Quando o cliente paga, o sistema dá a baixa sozinho no lançamento." />
      <Card><CardBody><FeeConfigPanel status={status} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} /></CardBody></Card>
    </div>
  );
}
