import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { PetitionForm } from "@/modules/petitions/petition-form";
import { can } from "@/server/context";
import { listDocuments } from "@/server/services/document.service";
import { getPetition } from "@/server/services/petition.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar petição" };

export default async function EditPetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "petitions:write") || !can(ctx, "documents:read")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getPetition(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!data) notFound();
  const p = data.petition;
  if (p.status !== "DRAFT") redirect(`/peticoes/${p.id}`);
  const documents = await listDocuments(ctx, { caseId: p.caseId });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar petição" description={`Processo: ${p.case.title}`} />
      <PetitionForm petitionId={p.id} initial={{ caseId: p.caseId, documentId: p.documentId, title: p.title, kind: p.kind ?? "", court: p.court ?? "" }} documents={documents.map((d) => ({ id: d.id, name: d.name, currentVersion: d.currentVersion }))} />
    </div>
  );
}
