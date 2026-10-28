import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { CaseForm, EMPTY_CASE } from "@/modules/cases/case-form";
import { can } from "@/server/context";
import { listAssignableMembers, listCaseDepartments } from "@/server/services/case.service";
import { getClient } from "@/server/services/client.service";
import { uuidSchema } from "@/lib/validation/common";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo caso ou processo" };

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:write")) return <AccessDenied />;
  const [members, departments, sp] = await Promise.all([listAssignableMembers(ctx), listCaseDepartments(ctx), searchParams]);
  const parsedClient = uuidSchema.safeParse(sp.cliente);
  const client = parsedClient.success && can(ctx, "clients:read") ? await getClient(ctx, parsedClient.data).catch(() => null) : null;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Novo caso ou processo" description="Comece como caso, escolha a área e o departamento. Quando houver judicialização, altere a natureza e informe o número CNJ no mesmo cadastro." />
      <CaseForm initial={{ ...EMPTY_CASE, clientId: client?.id ?? "" }} initialClientLabel={client?.name ?? ""} members={members} departments={departments} />
    </div>
  );
}
