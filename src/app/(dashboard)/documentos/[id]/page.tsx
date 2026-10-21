import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { formatBytes } from "@/lib/format/phone";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { DocumentMetaForm } from "@/modules/documents/document-meta-form";
import { DOCUMENT_CATEGORY_LABEL, type DocumentCategory } from "@/modules/documents/schemas";
import { DocumentShareToggle } from "@/modules/portal/share-toggle";
import { VersionUploader } from "@/modules/documents/version-uploader";
import { PETITION_STATUS_LABEL, PETITION_STATUS_TONE, type PetitionStatusKey } from "@/modules/petitions/schemas";
import { can } from "@/server/context";
import { getDocument } from "@/server/services/document.service";
import { getDocumentTextInfo } from "@/server/services/document-text.service";
import { TextPanel } from "@/modules/documents/text-panel";
import { userNames } from "@/server/services/members";
import { isConvertible } from "@/lib/google/drive";
import { DocumentDriveCard } from "@/modules/google/google-ui";
import { driveEnabled, getDocumentDriveLink } from "@/server/services/google-drive.service";
import { SuggestOneButton, SuggestionItem } from "@/modules/documents/classify-ui";
import { getPendingForDocument } from "@/server/services/doc-classify.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Documento" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ faltam?: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "documents:read")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getDocument(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!data) notFound();
  const { doc, versions, owner, petitions } = data;
  const textInfo = await getDocumentTextInfo(ctx, doc.id);
  const names = await userNames(ctx, versions.map((v) => v.uploadedById));
  const canWrite = can(ctx, "documents:write");
  const pendingClass = canWrite ? await getPendingForDocument(ctx, doc.id) : null;
  const driveOn = canWrite && (await driveEnabled(ctx));
  const driveLink = driveOn ? await getDocumentDriveLink(ctx, doc.id) : null;
  const missing = (await searchParams).faltam?.split("|").filter(Boolean).slice(0, 30) ?? [];
  const tz = organization.timezone;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={doc.name}
        description={owner.case ? `Processo: ${owner.case.title}` : owner.client ? `Cliente: ${owner.client.name}` : undefined}
        actions={
          <a href={`/api/documents/${doc.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:opacity-90">
            <Download className="h-4 w-4" aria-hidden /> Baixar versão atual (v{doc.currentVersion})
          </a>
        }
      />
      {missing.length > 0 ? (
        <Alert tone="warning" className="mb-4">
          Alguns dados não estavam cadastrados e ficaram marcados como <strong>[PREENCHER]</strong> no documento: {missing.join(", ")}. Abra o arquivo, complete e envie como nova versão.
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Histórico de versões" description="Cada envio gera uma nova versão; as anteriores continuam disponíveis para download." />
            <ul className="divide-y divide-border">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">v{v.version}</span> · {v.fileName}{" "}
                      {v.version === doc.currentVersion ? <Badge tone="success">atual</Badge> : null}{" "}
                      {v.source === "TEMPLATE" ? <Badge tone="info">gerado de modelo</Badge> : null}
                    </p>
                    <p className="text-xs text-muted">
                      {formatBytes(v.sizeBytes)} · {formatDateTime(v.createdAt, tz)}
                      {v.uploadedById ? ` · ${names.get(v.uploadedById) ?? "ex-membro"}` : ""}
                    </p>
                    {v.note ? <p className="mt-0.5 text-xs">{v.note}</p> : null}
                    <p className="mt-0.5 font-mono text-[10px] text-muted" title="SHA-256 do arquivo">sha256 {v.sha256.slice(0, 16)}…</p>
                  </div>
                  <a href={`/api/documents/${doc.id}?v=${v.version}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 text-sm hover:bg-surface-3" aria-label={`Baixar versão ${v.version}`}>
                    <Download className="h-3.5 w-3.5" aria-hidden /> Baixar
                  </a>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Texto do documento" description="Extraído do arquivo (texto do PDF, DOCX ou OCR de imagens/digitalizados) para a busca por conteúdo e para a IA." />
            <CardBody>
              <TextPanel documentId={doc.id} info={textInfo ? { ...textInfo, preview: textInfo.preview } : null} canWrite={canWrite} />
            </CardBody>
          </Card>
          {petitions.length > 0 ? (
            <Card>
              <CardHeader title="Petições que usam este documento" />
              <ul className="divide-y divide-border">
                {petitions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <Link href={`/peticoes/${p.id}`} className="hover:underline">{p.title}</Link>
                    <span className="flex items-center gap-2 text-xs text-muted">v{p.documentVersion} <Badge tone={PETITION_STATUS_TONE[p.status as PetitionStatusKey]}>{PETITION_STATUS_LABEL[p.status as PetitionStatusKey]}</Badge></span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <div className="space-y-4">
          {canWrite ? (
            <>
              <Card>
                <CardHeader title="Dados do documento" />
                <CardBody>
                  <DocumentMetaForm id={doc.id} initial={{ name: doc.name, category: doc.category ?? "", description: doc.description ?? "" }} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Portal do cliente" description="Somente a versão atual é entregue, e só se o processo (ou o cliente) também estiver compartilhado." />
                <CardBody className="space-y-2">
                  <p className="text-xs">{doc.sharedWithPortal ? "Compartilhado com o portal." : "Não compartilhado."}</p>
                  <DocumentShareToggle documentId={doc.id} shared={doc.sharedWithPortal} />
                </CardBody>
              </Card>
              {can(ctx, "ai:use") || pendingClass ? (
                <Card>
                  <CardHeader title="Categoria por IA" description="A IA só sugere; você decide." />
                  <CardBody>
                    {pendingClass ? (
                      <SuggestionItem showName={false} s={{ id: pendingClass.id, documentId: doc.id, documentName: doc.name, suggested: pendingClass.suggested as DocumentCategory, confidence: pendingClass.confidence, reason: pendingClass.reason, stale: pendingClass.version !== doc.currentVersion }} />
                    ) : (
                      <SuggestOneButton documentId={doc.id} />
                    )}
                  </CardBody>
                </Card>
              ) : null}
              {driveOn ? (
                <Card>
                  <CardHeader title="Google Drive" description="Copie para o Drive do escritório e edite no Google Docs." />
                  <CardBody>
                    <DocumentDriveCard documentId={doc.id} link={driveLink ? { webViewLink: driveLink.webViewLink, isGoogleDoc: driveLink.isGoogleDoc, sentVersion: driveLink.sentVersion } : null} convertible={isConvertible(doc.mimeType)} />
                  </CardBody>
                </Card>
              ) : null}
              <Card>
                <CardHeader title="Nova versão" />
                <CardBody>
                  <VersionUploader documentId={doc.id} />
                  {petitions.some((p) => ["IN_REVIEW", "APPROVED"].includes(p.status)) ? (
                    <p className="mt-3 text-xs text-warning">Atenção: petições em revisão ou aprovadas que usam este documento voltarão para rascunho.</p>
                  ) : null}
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardBody className="space-y-1 text-sm">
                <p>Categoria: {doc.category ? (DOCUMENT_CATEGORY_LABEL[doc.category as DocumentCategory] ?? doc.category) : "—"}</p>
                {doc.description ? <p className="text-muted">{doc.description}</p> : null}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
