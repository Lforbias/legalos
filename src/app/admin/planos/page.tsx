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
      <PageHeader title="Planos e preços" description="O preço é cobrado por mês na cobrança automática. Plano sem preço não pode ser contratado pelo escritório (continua possível definir à mão em Escritórios). Mudanças de limite valem já para quem está no plano; nada é apagado." />
      {plans.map((p) => (
        <Card key={p.key}>
          <CardHeader title={p.name} />
          <CardBody><PlanEditor plan={p} /></CardBody>
        </Card>
      ))}
    </div>
  );
}
