import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { EMPTY_TEMPLATE } from "@/modules/templates/schemas";
import { TemplateForm } from "@/modules/templates/template-form";
import { can } from "@/server/context";
import { listSnippets } from "@/server/services/snippet.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo modelo" };

export default async function NewTemplatePage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "templates:manage")) return <AccessDenied />;
  const snippets = (await listSnippets(ctx)).filter((x) => x.active).map((x) => ({ slug: x.slug, name: x.name }));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Novo modelo" />
      <TemplateForm initial={EMPTY_TEMPLATE} snippets={snippets} />
    </div>
  );
}
