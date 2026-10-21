import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { requirePlatform } from "@/server/platform";
import { integrationsHealth } from "@/server/services/platform.service";

export const metadata: Metadata = { title: "Administração — saúde e integrações" };
export const dynamic = "force-dynamic";

const status = (s: string | null) => (s === "OK" ? <Badge tone="success">ok</Badge> : s === "ERROR" ? <Badge tone="danger">erro</Badge> : <Badge tone="neutral">nunca rodou</Badge>);

export default async function HealthPage() {
  const { pc } = await requirePlatform();
  const h = await integrationsHealth(pc);
  const rows = [
    ...h.djen.map((d) => ({ kind: "DJEN", org: d.organization, label: d.label, enabled: d.enabled, at: d.lastSyncAt, status: d.lastStatus, msg: d.lastMessage })),
    ...h.mni.map((d) => ({ kind: `PJe ${d.jtr}`, org: d.organization, label: d.label, enabled: d.enabled, at: d.lastSyncAt, status: d.lastStatus, msg: d.lastMessage })),
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Saúde e integrações" description="Estado do sistema e das integrações de todos os escritórios. Só mostra se cada chave está configurada, nunca o valor." />
      <Card>
        <CardHeader title="Sistema" />
        <CardBody className="space-y-2 text-sm">
          <p>Banco de dados: {h.system.database ? <Badge tone="success">responde</Badge> : <Badge tone="danger">fora do ar</Badge>} · Migrações: {h.system.migrations ? <Badge tone="success">aplicadas</Badge> : <Badge tone="danger">pendentes</Badge>}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {h.system.flags.map((f) => (
              <li key={f.name}>{f.configured ? <Badge tone="success">configurado</Badge> : <Badge tone="warning">ausente</Badge>} <span className="ml-1">{f.name}</span></li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Certificados digitais" description="Contagem em todos os escritórios (sem nomes nem titulares)." />
        <CardBody className="flex flex-wrap gap-6 text-sm">
          <span>Válidos: <strong>{h.certificates.active}</strong></span>
          <span>Vencem em 30 dias: <strong>{h.certificates.expiring30}</strong></span>
          <span>Vencidos (não revogados): <strong>{h.certificates.expired}</strong></span>
          <span>Escritórios com DataJud ligado: <strong>{h.datajudOrgs}</strong></span>
        </CardBody>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Captura de intimações" description="DJEN por OAB e PJe/MNI por tribunal, com o resultado da última verificação." />
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">Nenhum monitoramento cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Integrações de captura</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Tipo</th>
                <th scope="col" className="px-3 py-2 font-medium">Escritório</th>
                <th scope="col" className="px-3 py-2 font-medium">Nome</th>
                <th scope="col" className="px-3 py-2 font-medium">Ligado</th>
                <th scope="col" className="px-3 py-2 font-medium">Última verificação</th>
                <th scope="col" className="px-3 py-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{r.kind}</td>
                  <td className="px-3 py-2">{r.org}</td>
                  <td className="px-3 py-2 text-muted">{r.label}</td>
                  <td className="px-3 py-2">{r.enabled ? "sim" : "não"}</td>
                  <td className="px-3 py-2 text-muted">{r.at ? formatDateTime(r.at) : "—"}</td>
                  <td className="px-3 py-2">{status(r.status)} {r.status === "ERROR" && r.msg ? <span className="text-xs text-muted">{r.msg}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
