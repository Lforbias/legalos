import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { formatMoneyBR } from "@/lib/validation/money";
import { Cadastros } from "@/modules/finance/cadastros";
import { FinanceNav } from "@/modules/finance/finance-nav";
import { ACCOUNT_KIND_LABEL } from "@/modules/finance/schemas";
import { can } from "@/server/context";
import { listAccounts, listCategories, listCostCenters } from "@/server/services/finance.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Cadastros financeiros" };

export default async function FinanceSettingsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:read")) return <AccessDenied />;
  const [accounts, categories, costCenters] = await Promise.all([
    listAccounts(ctx, { includeInactive: true }),
    listCategories(ctx, { includeInactive: true }),
    listCostCenters(ctx, { includeInactive: true }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Cadastros financeiros" description="Contas, categorias e centros de custo usados nos lançamentos. Itens em uso são desativados, nunca apagados." />
      <FinanceNav current="cadastros" />
      <Cadastros
        canManage={can(ctx, "finance:manage")}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, active: a.active, detail: `${ACCOUNT_KIND_LABEL[a.kind as keyof typeof ACCOUNT_KIND_LABEL] ?? a.kind} · saldo inicial R$ ${formatMoneyBR(a.initialBalance.toString())}` }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        costCenters={costCenters.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
      />
    </div>
  );
}
