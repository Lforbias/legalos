import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, HeartPulse, Inbox, PlugZap, ScrollText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { ConnectionList } from "@/modules/box-v3/connection-list";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";
import { listBoxV3Connections, listBoxV3Notices, getBoxV3Monitoring, getBoxV3PetitionQueue } from "@/server/judicial/box-v3.service";

export const metadata: Metadata = { title: "LegalOS Box 3.0 · Prévia" };

export default async function BoxV3Page() {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("inbox:read")) return <p className="text-sm text-muted">Você não tem acesso à área de intimações deste escritório.</p>;

  const [connections, inbox, monitoring, petitionQueue] = await Promise.all([
    listBoxV3Connections(ctx),
    listBoxV3Notices(ctx, { folder: "abertas", take: 1 }),
    getBoxV3Monitoring(ctx),
    ctx.permissions.has("petitions:read") ? getBoxV3PetitionQueue(ctx) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="box-v3-preview">
      <PageHeader
        title="LegalOS Box 3.0"
        description="Caixa judicial e conexões separadas por fonte, operação e evidência de funcionamento."
        actions={<Link href="/box-v3/conexoes" className={buttonVariants({ variant: "secondary" })}>Ver conexões <ArrowRight className="h-4 w-4" aria-hidden /></Link>}
      />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3" />

      <Alert tone="warning" data-testid="box-v3-scope-banner">
        Consulta da caixa e histórico preservado; ações internas são explícitas. Não consulta tribunais, não registra ciência e não envia petições. Dados de configuração antigos não comprovam que uma conexão esteja funcionando.
      </Alert>

      <section aria-labelledby="box-v3-summary-heading">
        <div className="mb-3 flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-muted" aria-hidden />
          <h2 id="box-v3-summary-heading" className="text-sm font-semibold">Estado das fontes registradas</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardBody><p className="text-xs text-muted">Cadastros preservados</p><p className="mt-2 text-3xl font-semibold tabular-nums">{connections.length}</p></CardBody></Card>
          <Card><CardBody><p className="text-xs text-muted">Comunicações em aberto</p><p className="mt-2 text-3xl font-semibold tabular-nums">{inbox.counts.abertas}</p></CardBody></Card>
          <Card><CardBody><p className="text-xs text-muted">Validações próprias do Box 3.0</p><p className="mt-2 text-3xl font-semibold tabular-nums">0</p></CardBody></Card>
          <Card><CardBody><p className="text-xs text-muted">Execuções no histórico</p><p className="mt-2 text-3xl font-semibold tabular-nums">{monitoring.runCount}</p></CardBody></Card>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Acessos do Box 3.0">
        {[
          { href: "/box-v3/entrada", label: "Abrir caixa de entrada", value: `${inbox.counts.entrada} novas · ${inbox.counts.abertas} em aberto`, Icon: Inbox },
          { href: "/box-v3/conexoes", label: "Ver conexões", value: `${connections.length} fontes no cadastro histórico`, Icon: PlugZap },
          { href: "/box-v3/monitoramento", label: "Ver monitoramento", value: `${monitoring.withProblems} execuções com problema no histórico`, Icon: HeartPulse },
          ...(petitionQueue ? [{ href: "/box-v3/peticionamento", label: "Ver fila de protocolos", value: `${petitionQueue.items.length} registros recentes`, Icon: ScrollText }] : []),
        ].map(({ href, label, value, Icon }) => <Link key={href} href={href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Card className="h-full transition-colors hover:border-primary/50"><CardBody><Icon className="h-4 w-4 text-primary-text" aria-hidden /><p className="mt-3 text-sm font-semibold">{label}<ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden /></p><p className="mt-1 text-xs text-muted">{value}</p></CardBody></Card></Link>)}
      </section>

      <Card>
        <CardHeader title="Primeiro corte do Box 3.0" description="A reconstrução começa pela clareza da conexão e da evidência, antes de liberar ações judiciais." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3">
            <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden />
            <div><h3 className="text-sm font-medium">Conexões por operação</h3><p className="mt-1 text-sm text-muted">Consulta, captura, leitura de autos e protocolo terão estados próprios. Um cadastro não será apresentado como conexão validada.</p></div>
          </div>
          <div className="flex gap-3">
            <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden />
            <div><h3 className="text-sm font-medium">Evidência e próximo passo</h3><p className="mt-1 text-sm text-muted">Cada fonte mostrará quando foi verificada, o que funcionou e o que precisa de atenção.</p></div>
          </div>
        </CardBody>
      </Card>

      <section aria-labelledby="box-v3-sources-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 id="box-v3-sources-heading" className="text-sm font-semibold">Fontes judiciais</h2><p className="mt-1 text-xs text-muted">Os registros abaixo são históricos; o Box 3.0 ainda não fez suas próprias validações.</p></div>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">Somente leitura</span>
        </div>
        <ConnectionList connections={connections} timezone={ctx.timezone} />
      </section>
    </div>
  );
}
