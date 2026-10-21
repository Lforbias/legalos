import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { db } from "@/lib/db/client";
import { GenerateForm } from "@/modules/templates/generate-form";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { listLetterheads } from "@/server/services/letterhead.service";
import { listTemplates } from "@/server/services/template.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Gerar documento de modelo" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ modelo?: string; processo?: string; cliente?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "documents:write")) return <AccessDenied />;
  const sp = await searchParams;
  const [allTemplates, letterheads, cases] = await Promise.all([listTemplates(ctx), listLetterheads(ctx, { onlyActive: true }), can(ctx, "cases:read") ? listCaseOptions(ctx) : Promise.resolve([])]);
  const templates = allTemplates.filter((t) => t.active);
  const templateId = templates.some((t) => t.id === sp.modelo) ? (sp.modelo as string) : "";
  const caseId = cases.some((c) => c.id === sp.processo) ? (sp.processo as string) : "";
  let clientId = "";
  let clientLabel = "";
  if (!caseId && UUID.test(sp.cliente ?? "") && can(ctx, "clients:read")) {
    const c = await db.client.findFirst({ where: { id: sp.cliente, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true } });
    if (c) {
      clientId = c.id;
      clientLabel = c.name;
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Gerar documento de modelo" description="O documento é criado em .docx editável e guardado como versão 1." />
      {templates.length === 0 ? (
        <Alert tone="warning">Não há modelos ativos. {can(ctx, "templates:manage") ? "Crie um em Documentos › Modelos." : "Peça a um administrador para cadastrar modelos."}</Alert>
      ) : (
        <GenerateForm
          letterheads={letterheads.map((l) => ({ id: l.id, name: l.name, isDefault: l.isDefault }))}
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          cases={cases}
          initialClientLabel={clientLabel}
          initial={{ templateId, target: clientId ? "client" : "case", caseId, clientId, title: "" }}
        />
      )}
    </div>
  );
}
