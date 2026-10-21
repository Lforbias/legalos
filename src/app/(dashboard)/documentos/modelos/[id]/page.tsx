import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { TemplateForm } from "@/modules/templates/template-form";
import { can } from "@/server/context";
import { getTemplate } from "@/server/services/template.service";
import { listSnippets } from "@/server/services/snippet.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar modelo" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "templates:manage")) return <AccessDenied />;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const t = await getTemplate(ctx, id.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!t) notFound();
  const snippets = (await listSnippets(ctx)).filter((x) => x.active).map((x) => ({ slug: x.slug, name: x.name }));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Editar modelo" description="Alterações valem para os próximos documentos gerados; documentos já gerados não mudam." />
      <TemplateForm templateId={t.id} initial={{ name: t.name, description: t.description ?? "", category: t.category ?? "", body: t.body, active: t.active }} snippets={snippets} />
    </div>
  );
}
