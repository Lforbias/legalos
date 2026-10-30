import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { ConnectionList } from "@/modules/box-v3/connection-list";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCapabilityCatalog } from "@/server/judicial/connections.service";
import { CAPABILITY_LABEL } from "@/lib/judicial/contracts";
import { listBoxV3Connections } from "@/server/judicial/box-v3.service";

export const metadata: Metadata = { title: "Conexões · LegalOS Box 3.0" };
const accessMethodLabel: Record<string, string> = { PUBLIC: "Fonte pública", OFFICIAL_API: "API oficial", MNI: "Integração MNI", PORTAL_ROBOT: "Acesso automatizado ao portal", CERTIFICATE: "Certificado digital", ASSISTED: "Operação assistida" };

export default async function BoxV3ConnectionsPage() {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("inbox:read")) return <p className="text-sm text-muted">Você não tem acesso à área de intimações deste escritório.</p>;

  const [connections, catalog] = await Promise.all([listBoxV3Connections(ctx), getCapabilityCatalog(ctx)]);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Conexões judiciais"
        description="Cada tribunal e cada operação precisa de uma validação própria."
        actions={<div className="flex flex-wrap gap-2"><Link href="/box-v3" className={buttonVariants({ variant: "secondary" })}><ArrowLeft className="h-4 w-4" aria-hidden /> Visão geral</Link>{ctx.permissions.has("certificates:manage") || ctx.permissions.has("integrations:manage") || ctx.permissions.has("cases:read") ? <Link href="/box-v3/configuracoes" className={buttonVariants({ variant: "secondary" })}>Certificados e acessos</Link> : null}</div>}
      />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/conexoes" />
      <Alert tone="info">Os dados abaixo são lidos do cadastro preservado. Esta prévia não testa acesso, não sincroniza e não altera conexões.</Alert>
      <Alert tone="warning">A extensão atual auxilia o login no navegador e detecta números visíveis. Ela não controla o PJeOffice instalado no computador nem prova o uso de um certificado local.</Alert>
      <ConnectionList connections={connections} timezone={ctx.timezone} />
      <section className="space-y-3" aria-labelledby="box-v3-capabilities-heading">
        <div><h2 id="box-v3-capabilities-heading" className="text-lg font-semibold">Catálogo por capacidade</h2><p className="mt-1 text-sm text-muted">Código disponível e homologação são coisas diferentes; nenhum resultado abaixo autoriza operação real.</p></div>
        {catalog.entries.map((entry) => <Card key={entry.key}>
          <CardHeader title={entry.label} description={`${entry.requiresAuthorization ? "Exige autorização do escritório" : "Não exige credencial do escritório"} · método registrado: ${accessMethodLabel[entry.accessMethod] ?? "Não informado"}`} />
          <CardBody className="space-y-3">
            <ul className="flex flex-wrap gap-2">{entry.implemented.map((cap) => <li key={cap.op}><Badge tone="neutral">{cap.label}: histórico {cap.stateLabel.toLowerCase()}</Badge></li>)}</ul>
            {entry.notImplemented.length ? <p className="text-xs text-muted">Ainda sem suporte no catálogo: {entry.notImplemented.map((op) => CAPABILITY_LABEL[op]).join(" · ")}.</p> : null}
            {entry.limitations.length ? <ul className="list-inside list-disc space-y-1 text-xs text-muted">{entry.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul> : null}
          </CardBody>
        </Card>)}
      </section>
    </div>
  );
}
