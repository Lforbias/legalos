import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db/client";
import { todayYmd } from "@/lib/dates/ymd";
import { EntryForm } from "@/modules/finance/entry-form";
import { EMPTY_ENTRY } from "@/modules/finance/schemas";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { listAccounts, listCategories, listCostCenters } from "@/server/services/finance.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo lançamento" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ cliente?: string; processo?: string; tipo?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:write")) return <AccessDenied />;
  const sp = await searchParams;
  const [accounts, categories, costCenters, caseRows] = await Promise.all([
    listAccounts(ctx),
    listCategories(ctx),
    listCostCenters(ctx),
    can(ctx, "cases:read") ? listCaseOptions(ctx) : Promise.resolve([]),
  ]);
  const cases = caseRows.map((c) => ({ id: c.id, name: c.number ? `${c.title} (${c.number})` : c.title }));
  const client = sp.cliente && UUID.test(sp.cliente) && can(ctx, "clients:read") ? await db.client.findFirst({ where: { id: sp.cliente, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true } }) : null;
  const caseId = sp.processo && cases.some((c) => c.id === sp.processo) ? sp.processo : "";
  const today = todayYmd(ctx.timezone);
  const payable = sp.tipo === "pagar";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo lançamento" />
      <EntryForm
        initial={{ ...EMPTY_ENTRY, kind: payable ? "PAYABLE" : "RECEIVABLE", type: payable ? "EXPENSE" : "FEE", issueDate: today, dueDate: today, clientId: client?.id ?? "", caseId }}
        accounts={accounts}
        categories={categories}
        costCenters={costCenters}
        cases={cases}
        clientLabel={client?.name ?? ""}
      />
    </div>
  );
}
