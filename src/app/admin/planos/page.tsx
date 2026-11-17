import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PlanEditor } from "@/modules/platform/admin-controls";
import { requirePlatform } from "@/server/platform";
import { listPlans } from "@/server/services/platform.service";

export const metadata: Metadata = { title: "Administração — planos e preços" };
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const { pc } = await requirePlatform();
  const plans = await listPlans(pc);
  return (
    <div className="space-y-4">
      <PageHeader title="Planos e preços" description="Os quatro planos públicos são sincronizados com o catálogo comercial central. Os registros internos continuam disponíveis para administrar assinaturas antigas. Mudanças de limites podem afetar o uso de quem já está no plano." />
      {plans.map((p) => (
        <Card key={p.key}>
          <CardHeader title={p.name} />
          <CardBody><PlanEditor plan={p} /></CardBody>
        </Card>
      ))}
    </div>
  );
}
