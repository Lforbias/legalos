import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatBytes } from "@/lib/format/phone";
import { ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { formatCnj } from "@/lib/validation/br-documents";
import { uuidSchema } from "@/lib/validation/common";
import { CASE_STATUS_LABEL } from "@/modules/cases/schemas";
import { getPortalCase } from "@/server/services/portal.service";
import { formatDate } from "@/lib/dates/format";
import { approvedUpdatesForPortalCase } from "@/server/services/portal-plus.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Processo" };

export default async function PortalCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getPortalCase(ctx, id.data).catch((e) => (e instanceof NotFoundError || e instanceof ForbiddenError ? null : Promise.reject(e)));
  if (!data) notFound();
  const { case: c, documents } = data;
  const updates = await approvedUpdatesForPortalCase(ctx, c.id);
  return (
    <div className="space-y-4">
      <Link href="/portal" className="text-sm text-primary-text hover:underline">← Voltar</Link>
      <h1 className="text-xl font-semibold tracking-tight">{c.title} <Badge>{CASE_STATUS_LABEL[c.status]}</Badge></h1>
      <Card>
        <CardHeader title="Resumo" />
        <CardBody className="space-y-1 text-sm">
          <p><span className="text-muted">Número:</span> {c.number ? formatCnj(c.number) : "—"}</p>
          <p><span className="text-muted">Tribunal / órgão:</span> {c.court ?? "—"}{c.courtUnit ? ` · ${c.courtUnit}` : ""}</p>
          <p><span className="text-muted">Fase:</span> {c.phase ?? "—"}</p>
          <p><span className="text-muted">Assunto:</span> {c.subject ?? "—"}</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Como está o seu processo" description="Textos revisados pela equipe, em linguagem simples." />
        {updates.length === 0 ? <p className="p-6 text-center text-sm text-muted">Ainda não há atualizações para mostrar.</p> : null}
        <ul className="divide-y divide-border">
          {updates.map((u) => (
            <li key={u.id} className="px-4 py-3 text-sm"><p>{u.plainText}</p><p className="mt-1 text-xs text-muted">{u.approvedAt ? formatDate(u.approvedAt, "America/Sao_Paulo") : ""}</p></li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Documentos compartilhados" />
        {documents.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhum documento compartilhado neste processo.</p> : null}
        <ul className="divide-y divide-border">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>{d.name} <span className="text-xs text-muted">{formatBytes(d.sizeBytes)}</span></span>
              <a href={`/api/portal/documents/${d.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 hover:bg-surface-3"><Download className="h-3.5 w-3.5" aria-hidden /> Baixar</a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
