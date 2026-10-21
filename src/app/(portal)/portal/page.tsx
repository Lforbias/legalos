import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates/format";
import { formatBytes } from "@/lib/format/phone";
import { formatCnj } from "@/lib/validation/br-documents";
import { CASE_STATUS_LABEL } from "@/modules/cases/schemas";
import { hasPortalAccess, listPortalCases, listPortalDocuments } from "@/server/services/portal.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Portal do cliente" };

export default async function PortalHome() {
  const { ctx, organization } = await requireTenant();
  if (!(await hasPortalAccess(ctx))) {
    return <Alert tone="warning">Seu acesso ao portal não está ativo. Entre em contato com o escritório.</Alert>;
  }
  const [cases, documents] = await Promise.all([listPortalCases(ctx), listPortalDocuments(ctx)]);
  const tz = organization.timezone;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Seus processos e documentos</h1>
      <Card>
        <CardHeader title="Processos" description="Resumo dos processos que o escritório compartilhou com você." />
        {cases.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhum processo compartilhado até o momento.</p> : null}
        <ul className="divide-y divide-border">
          {cases.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <Link href={`/portal/processos/${c.id}`} className="text-sm font-medium text-primary-text hover:underline">{c.title}</Link>
                <p className="text-xs text-muted">{c.number ? formatCnj(c.number) : "Sem número"}{c.court ? ` · ${c.court}` : ""}{c.phase ? ` · ${c.phase}` : ""}</p>
              </div>
              <Badge>{CASE_STATUS_LABEL[c.status]}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Documentos compartilhados" />
        {documents.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhum documento compartilhado até o momento.</p> : null}
        <ul className="divide-y divide-border">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-sm">{d.name}</p>
                <p className="text-xs text-muted">{formatBytes(d.sizeBytes)}{d.sharedAt ? ` · compartilhado em ${formatDate(d.sharedAt, tz)}` : ""}{d.case ? ` · ${d.case.title}` : ""}</p>
              </div>
              <a href={`/api/portal/documents/${d.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 text-sm hover:bg-surface-3" aria-label={`Baixar ${d.name}`}>
                <Download className="h-3.5 w-3.5" aria-hidden /> Baixar
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
