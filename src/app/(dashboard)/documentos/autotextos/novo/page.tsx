import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { EMPTY_SNIPPET } from "@/modules/snippets/schemas";
import { SnippetForm } from "@/modules/snippets/snippet-form";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo autotexto" };

export default async function NewSnippetPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "templates:manage")) return <AccessDenied />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo autotexto" />
      <SnippetForm initial={EMPTY_SNIPPET} />
    </div>
  );
}
