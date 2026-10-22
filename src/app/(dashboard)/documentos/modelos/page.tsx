import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteTemplateButton } from "@/modules/templates/template-row-actions";
import { can } from "@/server/context";
import { listTemplates } from "@/server/services/template.service";
import { listLinkedModels } from "@/server/services/linked-document.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Modelos de documentos" };

export default async function TemplatesPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "documents:read")) return <AccessDenied />;
  const templates = await listTemplates(ctx);
  const linkedModels = await listLinkedModels(ctx);
  const manage = can(ctx, "templates:manage");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Modelos de documentos"
        description="Textos com campos de mesclagem ({{cliente.nome}}, {{processo.numero}}…). Ao gerar, o sistema preenche com os dados cadastrados e entrega um .docx editável."
        actions={
          <div className="flex gap-2">
            <Link href="/documentos" className={bv({ variant: "secondary" })}>Voltar aos documentos</Link>
            <Link href="/documentos/autotextos" className={bv({ variant: "secondary" })}>Autotextos</Link>
            <Link href="/documentos/timbrados" className={bv({ variant: "secondary" })}>Timbrados</Link>
            {manage ? (
              <Link href="/documentos/modelos/novo" className={bv({})}>
                <Plus className="h-4 w-4" aria-hidden /> Novo modelo
              </Link>
            ) : null}
          </div>
        }
      />
      {templates.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhum modelo cadastrado{manage ? ". Crie o primeiro em “Novo modelo”." : "."}</Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {manage ? <Link href={`/documentos/modelos/${t.id}`} className="text-primary-text hover:underline">{t.name}</Link> : t.name}{" "}
                    {!t.active ? <Badge tone="warning">desativado</Badge> : null}
                  </p>
                  {t.description ? <p className="text-xs text-muted">{t.description}</p> : null}
                </div>
                <div className="flex items-start gap-2">
                  {t.active && can(ctx, "documents:write") ? (
                    <Link href={`/documentos/gerar?modelo=${t.id}`} className={bv({ variant: "secondary", size: "sm" })}>Gerar documento</Link>
                  ) : null}
                  {manage ? <DeleteTemplateButton id={t.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {linkedModels.length > 0 ? (
        <Card className="mt-4">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Modelos importados do Astrea (links)</h2>
            <p className="text-xs text-muted">São links para os modelos que estavam no Astrea. Para gerar documentos aqui, crie um modelo acima colando o texto.</p>
          </div>
          <ul className="divide-y divide-border">
            {linkedModels.map((m) => (
              <li key={m.id} className="px-4 py-2.5 text-sm"><a href={m.url} target="_blank" rel="noopener noreferrer" className="text-primary-text hover:underline">{m.name}</a></li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
