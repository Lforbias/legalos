import { BOX_AVAILABLE } from "@/lib/box-retirement";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { AstreaBackupForm } from "@/modules/case-import/astrea-backup-form";
import { ImportForm } from "@/modules/case-import/import-form";
import { can } from "@/server/context";
import { listImportBatches } from "@/server/services/case-import.service";
import { datajudStatus } from "@/server/services/datajud.service";
import { db } from "@/lib/db/client";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Importar processos" };

export default async function ImportPage() {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "cases:write")) return <AccessDenied />;
  const dj = await datajudStatus(ctx);
  const mniCount = BOX_AVAILABLE ? await db.courtConnection.count({ where: { organizationId: ctx.organizationId, enabled: true } }) : 0;
  const batches = await listImportBatches(ctx);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Importar processos" description="Cadastre vários processos de uma vez pelo número CNJ." actions={<Link href="/processos" className={buttonVariants({ variant: "secondary" })}>Voltar aos processos</Link>} />
      <ImportForm datajudReady={dj.keyConfigured && dj.orgEnabled} mniReady={mniCount > 0} canDocs={can(ctx, "documents:write")} />
      {ctx.isOwner ? <AstreaBackupForm /> : null}
      {can(ctx, "documents:write") ? (
        <Card>
          <CardHeader title="Trazer também os arquivos" description="Depois de importar clientes e processos, envie os documentos (PDFs, Word, imagens) de uma vez: arquivos soltos, uma pasta inteira ou um ZIP. O LegalOS liga cada arquivo ao processo ou cliente certo pelo número do processo, CPF/CNPJ ou nome da pasta." action={<Link href="/documentos/importar" className={buttonVariants({ variant: "secondary", size: "sm" })}>Enviar documentos em lote</Link>} />
        </Card>
      ) : null}
      {batches.length ? (
        <Card>
          <CardHeader title="Importações anteriores" />
          <CardBody>
            <ul className="divide-y divide-border text-sm">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <Link href={`/processos/importar/${b.id}`} className="text-primary-text hover:underline">{formatDateTime(b.createdAt, organization.timezone)}</Link>
                  <span className="text-xs text-muted">{b._count.items} número(s)</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
