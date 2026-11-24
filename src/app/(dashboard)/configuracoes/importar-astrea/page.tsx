import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { assertCan } from "@/server/context";
import { requireTenant } from "@/server/session";
import { AstreaImportPanel } from "@/modules/astrea-import/panel";

export const metadata: Metadata = { title: "Importar backup do Astrea" };
export const dynamic = "force-dynamic";

export default async function AstreaImportPage() {
  const { ctx, organization } = await requireTenant();
  assertCan(ctx, "organization:manage");
  return <div className="space-y-5"><PageHeader title="Importar backup do Astrea" description={`O ZIP será importado para ${organization.name}. Confira a simulação antes de gravar.`} /><AstreaImportPanel /></div>;
}
