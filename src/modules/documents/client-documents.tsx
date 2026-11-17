import { ClientDriveFolder } from "@/modules/google/client-drive-folder";
import { driveEnabled, getClientDriveFolder } from "@/server/services/google-drive.service";
import { can, type TenantContext } from "@/server/context";
import { listDocuments } from "@/server/services/document.service";
import { DocumentsPanel } from "./documents-panel";

export async function ClientDocuments({ ctx, clientId, revalidate }: {
  ctx: TenantContext;
  clientId: string;
  revalidate: string;
}) {
  if (!can(ctx, "documents:read")) return null;
  const [documents, hasDrive] = await Promise.all([listDocuments(ctx, { clientId }), driveEnabled(ctx)]);
  const folder = hasDrive ? await getClientDriveFolder(ctx, clientId) : null;
  const href = folder ? new URL(`https://drive.google.com/drive/folders/${encodeURIComponent(folder.folderId)}`) : null;
  if (folder?.resourceKey) href?.searchParams.set("resourcekey", folder.resourceKey);
  return (
    <>
      <DocumentsPanel
        owner={{ clientId }}
        canWrite={can(ctx, "documents:write")}
        timezone={ctx.timezone}
        revalidate={revalidate}
        documents={documents.map((document) => ({ id: document.id, name: document.name, sizeBytes: document.sizeBytes, createdAt: document.createdAt.toISOString(), currentVersion: document.currentVersion }))}
      />
      {hasDrive ? <ClientDriveFolder clientId={clientId} folder={folder && href ? { name: folder.name, href: href.toString() } : null} canManage={can(ctx, "integrations:manage") && can(ctx, "documents:write")} /> : null}
    </>
  );
}
