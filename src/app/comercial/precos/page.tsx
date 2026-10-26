import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { brl2 } from "@/lib/comercial/format";
import { AddonForm } from "@/modules/comercial/admin-forms";
import { ProposalBuilder } from "@/modules/comercial/proposal-builder";
import { requireComercial } from "@/server/comercial";
import { listCatalog } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — preços e planos" };
export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const { cx } = await requireComercial();
  const { plans, addons } = await listCatalog();
  const canEdit = cx.role === "GERENTE";
  return (
    <div className="space-y-4">
      <PageHeader title="Preços e planos" description="Os planos vêm da Administração (Planos e preços). Os aditivos, como a RUTE e a assinatura de contratos, são cobrados por cima do plano e ficam aqui. Use o simulador para montar um valor." />
      <Card><CardHeader title="Planos" description="Para alterar valores de plano, use Administração → Planos e preços." /><CardBody>
        <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
          <thead><tr className="text-xs text-muted"><th className="py-1 pr-3 font-medium">Plano</th><th className="py-1 pr-3 font-medium">Preço/mês</th><th className="py-1 pr-3 font-medium">Usuários</th><th className="py-1 font-medium">Descrição</th></tr></thead>
          <tbody>{plans.map((p) => <tr key={p.key} className="border-t border-border"><td className="py-1.5 pr-3 font-medium">{p.name}</td><td className="py-1.5 pr-3 tabular-nums">{p.priceCents == null ? "sem preço" : brl2(p.priceCents)}</td><td className="py-1.5 pr-3">{p.maxUsers ?? "ilimitado"}</td><td className="py-1.5 text-muted">{p.description ?? ""}</td></tr>)}</tbody>
        </table></div>
      </CardBody></Card>
      <Card><CardHeader title="Aditivos" description="Aparecem nas propostas. Sem preço definido, a proposta não pode ser salva." /><CardBody className="space-y-5">
        {addons.map((a) => <div key={a.key} className="border-b border-border pb-4 last:border-0"><AddonForm addon={a} canEdit={canEdit} /></div>)}
        {canEdit ? <div><h3 className="mb-2 text-sm font-medium">Novo aditivo</h3><AddonForm canEdit /></div> : null}
      </CardBody></Card>
      <Card><CardHeader title="Simulador de preço" description="Só calcula; não salva nada. Para salvar uma proposta, abra a ficha do escritório." /><CardBody>
        {plans.length ? <ProposalBuilder plans={plans} addons={addons.filter((a) => a.active)} /> : <p className="text-sm text-muted">Cadastre planos em Administração.</p>}
      </CardBody></Card>
    </div>
  );
}
