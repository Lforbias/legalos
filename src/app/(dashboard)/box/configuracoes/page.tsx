import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { boxV2Enabled } from "@/lib/features";
import { UFS } from "@/lib/mni/tribunals";
import { listProfessionals } from "@/server/judicial/professional.service";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { ProfessionalForm } from "@/modules/box/professional-form";

export const metadata: Metadata = { title: "Configurações do Box" };

export default async function BoxSettingsPage() {
  const { ctx } = await requireTenant();
  if (!boxV2Enabled(ctx.organizationId)) notFound();
  if (!can(ctx, "integrations:manage")) return <AccessDenied />;
  const [professionals, monitors] = await Promise.all([listProfessionals(ctx), db.djenMonitor.findMany({ where: { organizationId: ctx.organizationId }, select: { professionalId: true, enabled: true, firstVerifiedAt: true } })]);
  const monitorOf = new Map(monitors.filter((m) => m.professionalId).map((m) => [m.professionalId as string, m]));

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="box-settings">
      <PageHeader
        title="Configurações do Box"
        description="Quem o Box acompanha e para onde vão os avisos. Um escritório pode ter vários advogados e várias OABs."
        actions={<Link href="/box/configurar" className={buttonVariants({ variant: "secondary" })}>Assistente de configuração</Link>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader title="Advogados e OABs" description="Cada OAB cadastrada pode ter o monitoramento do DJEN ligado em Conexões Judiciais." />
          {professionals.length === 0 ? (
            <CardBody><p className="text-sm text-muted" data-testid="no-professionals">Nenhum advogado cadastrado ainda. Cadastre ao lado para começar.</p></CardBody>
          ) : (
            <ul className="divide-y divide-border" data-testid="professionals">
              {professionals.map((p) => {
                const m = monitorOf.get(p.id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="mt-0.5 text-xs text-muted">OAB {p.oabUf} {p.oabNumber}{p.notifyEmail ? ` · avisos para ${p.notifyEmail}` : " · sem e-mail para avisos"}</p>
                    </div>
                    {!p.active ? <Badge>Inativo</Badge> : !m ? <Badge tone="warning">Monitoramento não ligado</Badge> : !m.enabled ? <Badge>Monitoramento desligado</Badge> : m.firstVerifiedAt ? <Badge tone="success">Monitorado e verificado</Badge> : <Badge tone="warning">Monitorado, sem verificação real</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Cadastrar advogado" />
          <CardBody><ProfessionalForm ufs={UFS} /></CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Outras configurações" />
        <CardBody>
          <ul className="space-y-2 text-sm">
            <li><Link href="/certificados" className="text-primary-text hover:underline">Certificados digitais</Link> — cofre de certificados A1 e permissões de consulta e assinatura.</li>
            <li><Link href="/integracoes/pje" className="text-primary-text hover:underline">Acesso ao PJe</Link> — login do advogado no portal.</li>
            <li><Link href="/configuracoes" className="text-primary-text hover:underline">Configurações do escritório</Link> — equipe, perfis de acesso e auditoria.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
