import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { fromCents, toCents } from "@/lib/finance/money";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { EntryForm } from "@/modules/finance/entry-form";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { getEntry, listAccounts, listCategories, listCostCenters } from "@/server/services/finance.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar lançamento" };

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "finance:write")) return <AccessDenied />;
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) notFound();
  let data;
  try {
    data = await getEntry(ctx, parsed.data);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { entry, client } = data;
  if (entry.status === "CANCELED") redirect(`/financeiro/lancamentos/${entry.id}`);
  const [accounts, categories, costCenters, caseRows] = await Promise.all([
    listAccounts(ctx),
    listCategories(ctx),
    listCostCenters(ctx),
    can(ctx, "cases:read") ? listCaseOptions(ctx) : Promise.resolve([]),
  ]);
  // mantém a referência atual mesmo se foi desativada depois
  const withCurrent = async <T extends { id: string; name: string }>(list: T[], currentId: string | null, name: string | null) =>
    currentId && name && !list.some((x) => x.id === currentId) ? [...list, { id: currentId, name: `${name} (inativo)` } as T] : list;
  const cases = caseRows.map((c) => ({ id: c.id, name: c.number ? `${c.title} (${c.number})` : c.title }));
  const [accs, cats, ccs] = await Promise.all([
    withCurrent(accounts, entry.accountId, data.accountName),
    withCurrent(categories, entry.categoryId, data.categoryName),
    withCurrent(costCenters, entry.costCenterId, data.costCenterName),
  ]);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar lançamento" description="O tipo (a receber / a pagar) não pode ser alterado. O valor não pode ficar abaixo do já baixado." />
      <EntryForm
        entryId={entry.id}
        locked
        initial={{
          kind: entry.kind,
          type: entry.type,
          description: entry.description,
          amount: fromCents(toCents(entry.amount.toString()) ?? 0n).replace(".", ","),
          issueDate: ymd(entry.issueDate),
          dueDate: ymd(entry.dueDate),
          accountId: entry.accountId ?? "",
          categoryId: entry.categoryId ?? "",
          costCenterId: entry.costCenterId ?? "",
          clientId: entry.clientId ?? "",
          caseId: entry.caseId ?? "",
          counterparty: entry.counterparty ?? "",
          notes: entry.notes ?? "",
          installments: "1",
        }}
        accounts={accs}
        categories={cats}
        costCenters={ccs}
        cases={cases}
        clientLabel={client?.name ?? ""}
      />
    </div>
  );
}
