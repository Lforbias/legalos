import { Globe } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { EmptyState } from "@/components/evolution/empty-state";
import { CourtCatalogList } from "@/modules/court-catalog/court-catalog-ui";
import { ConnectionPanel } from "@/modules/court-catalog/connection-panel";
import { can } from "@/server/context";
import { listCourtCatalog, getCourtCatalogSummary } from "@/server/services/court-catalog.service";
import { requireTenant } from "@/server/session";

export default async function FontesPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.juridico;

  if (!can(ctx, "integrations:manage")) {
    return (
      <>
        <DepartmentHeader icon={Globe} color={dept.color} title="Fontes e conexões" description="Catálogo de tribunais e estado das conexões do escritório." />
        <EmptyState icon={Globe} title="Sem acesso a integrações" description="Seu perfil não tem permissão para gerenciar integrações e conexões com tribunais." />
      </>
    );
  }

  const [courts, summary] = await Promise.all([listCourtCatalog(ctx), getCourtCatalogSummary()]);

  return (
    <>
      <DepartmentHeader
        icon={Globe}
        color={dept.color}
        title="Fontes e conexões"
        description="Conectores da Justiça Estadual, Federal e do Trabalho nos estados do Sul e Sudeste. Login, consulta e protocolo são habilitados conforme validação de cada portal."
      />
      <ConnectionPanel />
      <h2 className="mt-8 mb-4 text-base font-semibold">Tribunais no escopo dos conectores</h2>
      <CourtCatalogList courts={courts} summary={summary} />
    </>
  );
}
