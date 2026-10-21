import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteSnippetButton } from "@/modules/snippets/snippet-row-actions";
import { can } from "@/server/context";
import { listSnippets } from "@/server/services/snippet.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Autotextos" };

export default async function SnippetsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "documents:read")) return <AccessDenied />;
  const items = await listSnippets(ctx);
  const manage = can(ctx, "templates:manage");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Autotextos"
        description="Trechos prontos (qualificação, pedidos finais, fecho…) para reaproveitar nos modelos. No modelo, escreva {{autotexto.codigo}}; ao gerar o documento, o trecho entra no lugar e os campos dele são preenchidos."
        actions={
          <div className="flex gap-2">
            <Link href="/documentos/modelos" className={bv({ variant: "secondary" })}>Modelos</Link>
            {manage ? (
              <Link href="/documentos/autotextos/novo" className={bv({})}>
                <Plus className="h-4 w-4" aria-hidden /> Novo autotexto
              </Link>
            ) : null}
          </div>
        }
      />
      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhum autotexto cadastrado{manage ? ". Crie o primeiro em “Novo autotexto”." : "."}</Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {manage ? <Link href={`/documentos/autotextos/${s.id}`} className="text-primary-text hover:underline">{s.name}</Link> : s.name}{" "}
                    {!s.active ? <Badge tone="warning">desativado</Badge> : null}
                  </p>
                  <p className="font-mono text-xs text-muted">{`{{autotexto.${s.slug}}}`}</p>
                  {s.description ? <p className="text-xs text-muted">{s.description}</p> : null}
                </div>
                {manage ? <DeleteSnippetButton id={s.id} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
