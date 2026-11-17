import { ClientDriveFolder } from "@/modules/google/client-drive-folder";
import { driveEnabled, getClientDriveFolder } from "@/server/services/google-drive.service";
import { can, type TenantContext } from "@/server/context";
import { listDocuments, listDocumentsForClientCases } from "@/server/services/document.service";
import { listCasesForClient } from "@/server/services/case.service";
import { listLinkedDocuments } from "@/server/services/linked-document.service";
import { formatDateTime } from "@/lib/dates/format";
import { LinkedDocumentsCard } from "./linked-ui";
import { DocumentsPanel } from "./documents-panel";

export async function ClientDocuments({ ctx, clientId, revalidate }: {
  ctx: TenantContext;
  clientId: string;
  revalidate: string;
}) {
  if (!can(ctx, "documents:read")) return null;
  const [documents, linkedDocuments, hasDrive, cases, caseDocuments] = await Promise.all([
    listDocuments(ctx, { clientId }),
    listLinkedDocuments(ctx, { clientId }),
    driveEnabled(ctx),
    can(ctx, "cases:read") ? listCasesForClient(ctx, clientId) : Promise.resolve([]),
    can(ctx, "cases:read") ? listDocumentsForClientCases(ctx, clientId) : Promise.resolve([]),
  ]);
  const folder = hasDrive ? await getClientDriveFolder(ctx, clientId) : null;
  const href = folder ? new URL(`https://drive.google.com/drive/folders/${encodeURIComponent(folder.folderId)}`) : null;
  if (folder?.resourceKey) href?.searchParams.set("resourcekey", folder.resourceKey);
  const documentsByCase = new Map<string, typeof caseDocuments>();
  for (const document of caseDocuments) {
    if (!document.caseId) continue;
    const group = documentsByCase.get(document.caseId) ?? [];
    group.push(document);
    documentsByCase.set(document.caseId, group);
  }
  return (
    <>
      <DocumentsPanel
        owner={{ clientId }}
        canWrite={can(ctx, "documents:write")}
        timezone={ctx.timezone}
        revalidate={revalidate}
        title="Documentos do cliente"
        searchable
        documents={documents.map((document) => ({ id: document.id, name: document.name, sizeBytes: document.sizeBytes, createdAt: document.createdAt.toISOString(), currentVersion: document.currentVersion }))}
      />
      {cases.map((process) => (
        <DocumentsPanel
          key={process.id}
          owner={{ caseId: process.id }}
          canWrite={can(ctx, "documents:write")}
          timezone={ctx.timezone}
          revalidate={revalidate}
          title={`Documentos · ${process.number || process.title}`}
          description="Pasta deste processo dentro dos documentos do cliente."
          searchable
          documents={(documentsByCase.get(process.id) ?? []).map((document) => ({ id: document.id, name: document.name, sizeBytes: document.sizeBytes, createdAt: document.createdAt.toISOString(), currentVersion: document.currentVersion }))}
        />
      ))}
      <LinkedDocumentsCard
        clientId={clientId}
        title="Documentos do cliente por link"
        canWrite={can(ctx, "documents:write")}
        rows={linkedDocuments.map((document) => ({
          id: document.id,
          name: document.name,
          url: document.url,
          kind: document.kind,
          source: document.source,
          when: formatDateTime(document.originalAt ?? document.createdAt, ctx.timezone),
        }))}
      />
      {hasDrive ? <ClientDriveFolder clientId={clientId} folder={folder && href ? { name: folder.name, href: href.toString() } : null} canManage={can(ctx, "integrations:manage") && can(ctx, "documents:write")} /> : null}
    </>
  );
}
