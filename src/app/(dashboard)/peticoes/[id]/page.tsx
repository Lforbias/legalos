import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { getPetitioningAdapter } from "@/lib/petitioning/adapter";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { PetitionAttachments } from "@/modules/petitions/petition-attachments";
import { PetitionControls } from "@/modules/petitions/petition-controls";
import { PETITION_STATUS_LABEL, PETITION_STATUS_TONE, type AttachmentClassKey, type PetitionStatusKey } from "@/modules/petitions/schemas";
import { can } from "@/server/context";
import { listDocuments } from "@/server/services/document.service";
import { getPetition } from "@/server/services/petition.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Petição" };

export default async function PetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "petitions:read")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getPetition(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!data) notFound();
  const { petition: p, names, stale, attachments } = data;
  const tz = organization.timezone;
  const status = p.status as PetitionStatusKey;
  const canWrite = can(ctx, "petitions:write");
  const editableAtt = status === "DRAFT" && canWrite && can(ctx, "documents:read");
  const used = new Set([p.documentId, ...attachments.map((a) => a.documentId)]);
  const options = editableAtt ? (await listDocuments(ctx, { caseId: p.caseId })).filter((d) => !used.has(d.id)).map((d) => ({ id: d.id, name: d.name })) : [];
  const anyStale = attachments.some((a) => a.stale);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={p.title}
        description={p.kind ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={PETITION_STATUS_TONE[status]}>{PETITION_STATUS_LABEL[status]}</Badge>
            {status === "DRAFT" && canWrite ? (
              <Link href={`/peticoes/${p.id}/editar`} className={bv({ variant: "secondary" })}>
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
          </div>
        }
      />
      {p.isDemo || getPetitioningAdapter().isDemo ? (
        <Alert tone="warning" className="mb-4">
          Adaptador de demonstração: nenhum protocolo real foi ou será feito por esta tela. Para protocolar de fato, use o sistema do tribunal com o arquivo da versão aprovada.
        </Alert>
      ) : null}
      {!getPetitioningAdapter().isDemo ? (
        <Alert tone="warning" className="mb-4">
          Protocolo REAL pelo PJe/MNI: o envio é irreversível e vai ao tribunal. Esta integração ainda não foi validada em tribunal real; confira o recibo no sistema do tribunal.
        </Alert>
      ) : null}
      {p.reviewNote && status === "DRAFT" ? <Alert tone="info" className="mb-4">Devolvida para ajustes: {p.reviewNote}</Alert> : null}
      {p.error && status === "FAILED" ? <Alert tone="error" className="mb-4">{p.error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Dados" />
          <CardBody className="space-y-2 text-sm">
            <p><span className="text-muted">Processo:</span> <Link href={`/processos/${p.case.id}`} className="text-primary-text hover:underline">{p.case.title}</Link>{p.case.number ? ` — ${p.case.number}` : ""}</p>
            <p><span className="text-muted">Juízo / tribunal:</span> {p.court ?? "—"}</p>
            <p>
              <span className="text-muted">Documento:</span>{" "}
              <Link href={`/documentos/${p.document.id}`} className="text-primary-text hover:underline">{p.document.name}</Link>{" "}
              <Badge>v{p.documentVersion}</Badge>{stale ? <Badge tone="warning" className="ml-1">há versão mais nova (v{p.document.currentVersion})</Badge> : null}
            </p>
            <p><a className="text-primary-text hover:underline" href={`/api/documents/${p.document.id}?v=${p.documentVersion}`}>Baixar a versão {p.documentVersion}</a></p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Andamento" />
          <CardBody className="space-y-1.5 text-sm">
            <p><span className="text-muted">Preparada por:</span> {p.authorId ? (names.get(p.authorId) ?? "ex-membro") : "—"} em {formatDateTime(p.createdAt, tz)}</p>
            {p.reviewerId ? <p><span className="text-muted">Revisada por:</span> {names.get(p.reviewerId) ?? "ex-membro"}{p.reviewedAt ? ` em ${formatDateTime(p.reviewedAt, tz)}` : ""}</p> : null}
            {p.submittedAt ? <p><span className="text-muted">Enviada por:</span> {p.submittedById ? (names.get(p.submittedById) ?? "ex-membro") : "—"} em {formatDateTime(p.submittedAt, tz)}</p> : null}
            {p.protocol ? <p><span className="text-muted">{p.isDemo ? "Protocolo de demonstração:" : "Protocolo:"}</span> <span className="font-mono">{p.protocol}</span></p> : null}
          </CardBody>
        </Card>
      </div>

      {p.receipt ? (
        <Card className="mt-4">
          <CardHeader title="Recibo" />
          <CardBody><pre className="whitespace-pre-wrap break-words text-xs">{p.receipt}</pre></CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader title={`Anexos (${attachments.length})`} description="Documentos do processo que vão junto da petição, na ordem abaixo e com a classificação escolhida. A versão de cada anexo é travada no envio para revisão." />
        <CardBody>
          {anyStale && status !== "DRAFT" ? <Alert tone="warning" className="mb-3">Algum anexo recebeu nova versão depois do envio para revisão. Devolva a petição ao rascunho e reenvie.</Alert> : null}
          <PetitionAttachments
            petitionId={p.id}
            rows={attachments.map((a) => ({ id: a.id, documentId: a.documentId, name: a.document.name, version: a.documentVersion, classification: a.classification as AttachmentClassKey, stale: a.stale }))}
            options={options}
            editable={editableAtt}
          />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Ações" description="Fluxo: rascunho → revisão → aprovação → envio. A versão do documento revisada é a mesma que será enviada." />
        <CardBody>
          {["DRAFT", "IN_REVIEW", "APPROVED", "FAILED"].includes(status) ? (
            <PetitionControls id={p.id} status={status} stale={stale || anyStale} canWrite={canWrite} canApprove={can(ctx, "petitions:approve")} real={!getPetitioningAdapter().isDemo} caseNumber={p.case.number} />
          ) : (
            <p className="text-sm text-muted">{status === "SUBMITTING" ? "Envio em andamento. Recarregue em instantes." : "Esta petição está encerrada."}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
