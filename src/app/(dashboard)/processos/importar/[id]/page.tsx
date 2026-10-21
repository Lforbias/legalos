import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { BatchProgress } from "@/modules/case-import/batch-progress";
import { can } from "@/server/context";
import { getImportBatch } from "@/server/services/case-import.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Importação de processos" };

const CREATE_LABEL: Record<string, { label: string; tone: "success" | "info" | "danger" | "warning" | "neutral" }> = {
  CREATED: { label: "Cadastrado", tone: "success" },
  EXISTS: { label: "Já existia", tone: "info" },
  INVALID: { label: "Inválido", tone: "danger" },
  DUPLICATE: { label: "Repetido", tone: "warning" },
  FAILED: { label: "Falhou", tone: "danger" },
};
const STEP_LABEL: Record<string, string> = { NONE: "—", PENDING: "Aguardando", PARTIAL: "Em andamento", OK: "Feito", SKIPPED: "Não se aplica", FAILED: "Falhou" };

export default async function ImportBatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const b = await getImportBatch(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!b) notFound();
  const sp = await searchParams;
  const t = b.totals;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Importação de processos" description={`${t.total} número(s): ${t.created} cadastrado(s), ${t.exists} já existia(m), ${t.invalid + t.duplicate + t.failed} com problema.`} actions={<Link href="/processos/importar" className={buttonVariants({ variant: "secondary" })}>Nova importação</Link>} />
      {t.pending > 0 || sp.auto ? <Card><CardBody><BatchProgress batchId={b.id} pending={t.pending} autoStart={sp.auto === "1"} /></CardBody></Card> : null}
      <Card>
        <CardHeader title="Resultado por número" />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="import-items">
              <thead className="text-xs text-muted">
                <tr><th className="py-1 pr-3">Número</th><th className="pr-3">Cadastro</th>{b.options.datajud ? <th className="pr-3">DataJud</th> : null}{b.options.autos ? <th className="pr-3">Autos (MNI)</th> : null}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {b.items.map((i) => {
                  const c = CREATE_LABEL[i.createStatus] ?? { label: i.createStatus, tone: "neutral" as const };
                  return (
                    <tr key={i.id} className="align-top">
                      <td className="py-2 pr-3">{i.caseId ? <Link href={`/processos/${i.caseId}`} className="text-primary-text hover:underline">{i.number}</Link> : (i.number ?? i.raw)}</td>
                      <td className="pr-3"><Badge tone={c.tone}>{c.label}</Badge>{i.message ? <p className="text-xs text-muted">{i.message}</p> : null}</td>
                      {b.options.datajud ? <td className="pr-3">{STEP_LABEL[i.syncStatus]}{i.syncMessage ? <p className="text-xs text-muted">{i.syncMessage}</p> : null}</td> : null}
                      {b.options.autos ? <td className="pr-3">{STEP_LABEL[i.autosStatus]}{i.autosMessage ? <p className="text-xs text-muted">{i.autosMessage}</p> : null}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
