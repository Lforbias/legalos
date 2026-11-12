import Link from "next/link";
import { Briefcase, Globe, TrendingUp } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { EmptyState } from "@/components/evolution/empty-state";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";

export default async function ComercialPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.comercial;
  const hasCrm = can(ctx, "crm:read");
  const hasPortal = can(ctx, "portal:access");

  if (!hasCrm && !hasPortal) {
    return (
      <>
        <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />
        <EmptyState icon={TrendingUp} title="Sem acesso ao Comercial" description="Seu perfil não tem permissão para o CRM ou portal. Solicite acesso ao administrador." />
      </>
    );
  }

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      <h2 className="mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hasCrm && (
          <Link href="/crm" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Briefcase className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">CRM / Leads</p>
              <p className="text-[12px] text-muted">Funil de leads, propostas e conversão em cliente</p>
            </div>
          </Link>
        )}
        {hasPortal && (
          <Link href="/portal" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Globe className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Portal do cliente</p>
              <p className="text-[12px] text-muted">Processos e documentos compartilhados</p>
            </div>
          </Link>
        )}
      </div>

      <div className="mt-8 rounded-xl border border-border/60 bg-surface-2/50 p-5">
        <p className="text-sm text-muted">
          <strong className="text-fg">Nota:</strong> Este é o Comercial do escritório — captação de clientes e funil de vendas.
          Ele é diferente do módulo <code className="rounded bg-surface-3 px-1 text-[12px]">/comercial</code> interno do LegalOS (planos e assinatura), que continua em Administração.
        </p>
      </div>
    </>
  );
}
