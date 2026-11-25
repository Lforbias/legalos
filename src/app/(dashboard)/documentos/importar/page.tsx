import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { BulkUpload } from "@/modules/documents/bulk-upload";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Enviar documentos em lote" };

export default async function BulkDocumentsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "documents:write")) return <AccessDenied />;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Enviar documentos em lote"
        description="Traga os arquivos de outra plataforma ou do seu computador de uma vez. O LegalOS sugere o cliente ou processo de cada arquivo e você confere antes de enviar."
        actions={<Link href="/documentos" className={buttonVariants({ variant: "secondary" })}>Voltar aos documentos</Link>}
      />
      <BulkUpload />
    </div>
  );
}
