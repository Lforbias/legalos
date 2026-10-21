import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { SnippetForm } from "@/modules/snippets/snippet-form";
import { can } from "@/server/context";
import { getSnippet } from "@/server/services/snippet.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar autotexto" };

export default async function EditSnippetPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "templates:manage")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const s = await getSnippet(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar autotexto" description="Vale para os próximos documentos gerados; documentos já gerados não mudam. Se mudar o código, ajuste os modelos que o usam." />
      <SnippetForm snippetId={s.id} initial={{ slug: s.slug, name: s.name, description: s.description ?? "", body: s.body, active: s.active }} />
    </div>
  );
}
