import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CAPABILITY_LABEL } from "@/lib/connectors/registry";
import { COURT_SYSTEMS } from "@/lib/court-systems";
import { SystemMapTable } from "@/modules/court-systems/system-map-ui";
import { can } from "@/server/context";
import { getReadinessReport, listSystemMap } from "@/server/services/court-system-map.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Sistemas dos tribunais" };

const TONE = { READY: "success", UNVALIDATED: "warning", NO_CONNECTOR: "danger", UNKNOWN: "danger" } as const;
const STATE = { READY: "Pronto", UNVALIDATED: "Sem validação real", NO_CONNECTOR: "Sem conector", UNKNOWN: "Desconhecido" } as const;

export default async function CourtSystemsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "integrations:manage")) return <AccessDenied />;
  const [rows, report] = await Promise.all([listSystemMap(ctx), getReadinessReport(ctx)]);
  return (
    <div className="space-y-4">
      <Alert tone="info">Diga qual sistema atende cada tribunal do escritório. Nada é presumido: o sistema pode ser definido no processo ou usado como padrão deste mapa. O adaptador atual atende apenas MNI 2.2.2, com contrato compatível verificado por conexão.</Alert>
      {report.blocked > 0 ? <Alert tone="warning">{report.blocked} tribunal(is) sem conexão compatível ativa: configure e verifique o serviço antes de consultar ou protocolar.</Alert> : null}
      {report.mapConflict > 0 ? <Alert tone="warning">{report.mapConflict} tribunal(is) têm conexão ativa que não corresponde ao sistema ou contrato configurado; a conexão não será usada.</Alert> : null}
      <Card>
        <CardHeader title="Prontidão dos conectores" description="O que o LegalOS faz de fato em cada sistema." />
        <CardBody>
          <ul className="divide-y divide-border text-sm" data-testid="readiness">
            {report.bySystem.map((s) => (
              <li key={s.system} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{s.label} <span className="text-xs font-normal text-muted">({s.courts} tribunal(is) neste escritório)</span></p>
                  <p className="text-xs text-muted">{s.readiness.message}{s.readiness.capabilities.length ? ` Faz: ${s.readiness.capabilities.map((c) => CAPABILITY_LABEL[c]).join(", ")}.` : ""}</p>
                </div>
                <Badge tone={TONE[s.readiness.state]}>{STATE[s.readiness.state]}</Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Sistema por tribunal" />
        <CardBody>
          <SystemMapTable rows={rows.map((r) => ({ jtr: r.jtr, label: r.label, system: r.system, message: r.readiness?.message ?? null, mniConnection: r.mniConnection }))} systems={COURT_SYSTEMS.map((s) => ({ key: s.key, label: s.label }))} />
        </CardBody>
      </Card>
    </div>
  );
}
