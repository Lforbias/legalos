import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates/format";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { getBoxV3Monitoring, listBoxV3Connections } from "@/server/judicial/box-v3.service";
import { ConnectionList } from "@/modules/box-v3/connection-list";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";
import { acknowledgeBoxV3HealthAlertAction } from "./actions";

export const metadata: Metadata = { title: "Monitoramento · LegalOS Box 3.0" };

export default async function BoxV3MonitoringPage() {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("inbox:read")) return <p className="text-sm text-muted">Você não tem acesso à área de intimações deste escritório.</p>;
  const [connections, snapshot] = await Promise.all([listBoxV3Connections(ctx), getBoxV3Monitoring(ctx)]);
  const recent = snapshot.evidence.slice(0, 20);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Monitoramento" description="Acompanhe o histórico preservado de verificações e execuções por fonte." />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/monitoramento" />
      <Alert tone="warning">Os estados abaixo são históricos. Esta tela não consulta os tribunais, não liga monitoramentos e não atualiza dados.</Alert>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardBody><p className="text-xs text-muted">Fontes cadastradas</p><p className="mt-2 text-3xl font-semibold">{connections.length}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-muted">Execuções ainda marcadas como abertas</p><p className="mt-2 text-3xl font-semibold">{snapshot.active}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-muted">Execuções com falha parcial ou total</p><p className="mt-2 text-3xl font-semibold">{snapshot.withProblems}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-muted">Alertas em aberto</p><p className="mt-2 text-3xl font-semibold">{snapshot.openAlerts}</p></CardBody></Card>
      </div>
      <Card><CardHeader title="Fontes e operações" description="Cada operação precisa de evidência própria. O cadastro, sozinho, não indica que uma fonte esteja ativa." /><CardBody><ConnectionList connections={connections} timezone={ctx.timezone} /></CardBody></Card>
      <Card>
        <CardHeader title="Verificações registradas" description="Amostra das 20 evidências mais recentes. Detalhes técnicos brutos ficam fora desta visão." />
        <CardBody>
          {!recent.length ? <p className="text-sm text-muted">Nenhuma evidência de verificação registrada.</p> : <div className="divide-y divide-border">{recent.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{item.connectorKey} · {item.operation}</p><p className="mt-1 text-xs text-muted">Tribunal/fonte: {item.courtCode} · ambiente {item.environment} · motivo {item.reasonCode ?? "sem código"}</p></div><div className="flex items-center gap-2"><Badge tone={item.outcome === "PASSED" ? "success" : item.outcome === "FAILED" ? "danger" : "warning"}>{item.outcome === "PASSED" ? "Validou" : item.outcome === "FAILED" ? "Falhou" : "Inconclusiva"}</Badge><span className="text-xs text-muted">{formatDateTime(item.checkedAt, ctx.timezone)}</span></div></div>)}</div>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Alertas registrados" description="Somente código, gravidade e estado; detalhes brutos e dados de conexão não são exibidos." />
        <CardBody>{!snapshot.alerts.length ? <p className="text-sm text-muted">Nenhum alerta registrado.</p> : <div className="divide-y divide-border">{snapshot.alerts.map((alert) => <div key={alert.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{alert.code}</p><p className="mt-1 text-xs text-muted">{alert.occurrences} ocorrência(s) · último registro {formatDateTime(alert.lastSeenAt, ctx.timezone)}</p></div><div className="flex flex-wrap items-center gap-2"><Badge tone={alert.severity === "CRITICAL" || alert.severity === "ERROR" ? "danger" : alert.severity === "WARNING" ? "warning" : "neutral"}>{alert.severity === "CRITICAL" ? "Crítico" : alert.severity === "ERROR" ? "Erro" : alert.severity === "WARNING" ? "Atenção" : "Informativo"}</Badge><Badge tone={alert.state === "OPEN" ? "warning" : alert.state === "ACKNOWLEDGED" ? "info" : "neutral"}>{alert.state === "OPEN" ? "Aberto" : alert.state === "ACKNOWLEDGED" ? "Reconhecido" : "Resolvido"}</Badge>{alert.state === "OPEN" && ctx.permissions.has("integrations:manage") ? <form action={acknowledgeBoxV3HealthAlertAction}><input type="hidden" name="id" value={alert.id} /><button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>Reconhecer</button></form> : null}</div></div>)}</div>}</CardBody>
      </Card>
    </div>
  );
}
