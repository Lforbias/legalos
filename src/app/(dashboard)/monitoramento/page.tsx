import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { can } from "@/server/context";
import { getMonitoringOverview, runMonitoringCheck, type SourceHealth } from "@/server/services/monitoring.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Monitoramento" };

const LABEL: Record<SourceHealth, string> = { OK: "Em dia", ERROR: "Com erro", STALE: "Parada", NEVER: "Nunca rodou", OFF: "Desligada" };
const TONE: Record<SourceHealth, "success" | "danger" | "warning" | "neutral"> = { OK: "success", ERROR: "danger", STALE: "warning", NEVER: "warning", OFF: "neutral" };

export default async function MonitoringPage() {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "integrations:manage")) return <AccessDenied />;
  await runMonitoringCheck(ctx.organizationId).catch(() => null);
  const o = await getMonitoringOverview(ctx);
  const tz = organization.timezone;
  const max = Math.max(1, ...o.importedByDay.map((d) => d.count));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Monitoramento de intimações" description="Mostra se a captura automática (DJEN e PJe/MNI) está rodando. Quem administra integrações recebe aviso quando uma fonte falha ou para." />
      {o.problems > 0 ? <Alert tone="error">{o.problems} fonte(s) com erro ou parada. Intimações novas podem não estar chegando: confira abaixo.</Alert> : null}
      {o.sources.length === 0 ? <Alert tone="info">Nenhuma fonte configurada. Cadastre um monitoramento do DJEN ou uma conexão PJe/MNI em <Link href="/integracoes" className="underline">Integrações</Link>.</Alert> : null}
      <Card>
        <CardHeader title="Fontes" description={`Uma fonte ligada sem execução há mais de ${o.staleHours} horas é marcada como parada.`} />
        <CardBody>
          <ul className="divide-y divide-border text-sm" data-testid="monitoring-sources">
            {o.sources.map((s) => (
              <li key={`${s.kind}-${s.id}`} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{s.label} <span className="text-xs font-normal text-muted">({s.kind === "DJEN" ? "DJEN" : "PJe/MNI"} · {s.detail})</span></p>
                  <p className="text-xs text-muted">{s.lastSyncAt ? `Última execução: ${formatDateTime(s.lastSyncAt, tz)}` : "Sem execução registrada."}{s.message ? ` — ${s.message}` : ""}</p>
                </div>
                <Badge tone={TONE[s.health]}>{LABEL[s.health]}</Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Intimações importadas (7 dias)" description={`${o.importedTotal} no total, somando DJEN, PJe/MNI e DataJud.`} />
        <CardBody>
          <ul className="space-y-1.5 text-sm" data-testid="monitoring-days">
            {o.importedByDay.map((d) => (
              <li key={d.day} className="flex items-center gap-2">
                <span className="w-24 tabular-nums text-muted">{d.day.split("-").reverse().join("/")}</span>
                <span className="h-2 rounded bg-primary" style={{ width: `${Math.max(2, (d.count / max) * 60)}%` }} aria-hidden />
                <span className="tabular-nums">{d.count}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
