import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { SuggestBatchButton, SuggestionItem } from "@/modules/documents/classify-ui";
import { can } from "@/server/context";
import { listPendingClassifications } from "@/server/services/doc-classify.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Classificar documentos" };

export default async function ClassifyPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "documents:write")) return <AccessDenied />;
  const rows = await listPendingClassifications(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Classificar documentos" description="A IA sugere a categoria; nada muda até você aceitar ou corrigir. Suas decisões ensinam as próximas sugestões do escritório." />
      {!can(ctx, "ai:use") ? <Alert tone="info" className="mb-4">Seu perfil não pode pedir sugestões à IA, mas pode revisar as pendentes.</Alert> : <div className="mb-4"><SuggestBatchButton /></div>}
      <Card>
        <CardBody>
          {rows.length === 0 ? <p className="text-sm text-muted">Nenhuma sugestão pendente.</p> : null}
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <SuggestionItem s={r} />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
